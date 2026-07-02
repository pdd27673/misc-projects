import Foundation
import SwiftUI
import CoreGraphics

/// The central coordinator: owns the services, drives the
/// capture → OCR → parse → coach pipeline, and publishes state to the UI.
@MainActor
final class AppState: ObservableObject {

    // MARK: Pipeline state

    @Published var session: CoachSession = .empty
    @Published var ocrResult: OCRResult = .empty
    @Published var selectedMode: CoachMode = .clarify
    @Published var isBusy: Bool = false
    @Published var statusMessage: String = "Press ⌥⌘C to capture a problem."
    @Published var lastError: String?
    @Published var draftUnlocked: Bool = false

    /// The last region captured, for "reuse last region".
    @Published var lastRegion: CGRect?

    // MARK: UI preferences (persisted)

    @Published var alwaysOnTop: Bool {
        didSet {
            defaults.set(alwaysOnTop, forKey: Keys.alwaysOnTop)
            panel.setAlwaysOnTop(alwaysOnTop)
        }
    }
    @Published var compactMode: Bool { didSet { defaults.set(compactMode, forKey: Keys.compactMode) } }
    @Published var largeText: Bool { didSet { defaults.set(largeText, forKey: Keys.largeText) } }

    /// What the hotkey does. Default is fully automatic (browser window).
    @Published var captureMode: CaptureMode {
        didSet { defaults.set(captureMode.rawValue, forKey: Keys.captureMode) }
    }

    // MARK: Model settings (persisted)

    @Published var providerKind: CoachProviderKind {
        didSet { defaults.set(providerKind.rawValue, forKey: Keys.provider) }
    }
    @Published var apiKey: String { didSet { defaults.set(apiKey, forKey: Keys.apiKey) } }
    @Published var modelName: String { didSet { defaults.set(modelName, forKey: Keys.model) } }

    // MARK: Dependencies

    let store = SessionStore()
    private let capture = ScreenCaptureService()
    private let ocr = VisionOCRService()
    private let parser = PromptParser()
    private let regionSelector = RegionSelector()
    private let hotkey = HotkeyManager()
    let panel = PanelController()

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let alwaysOnTop = "alwaysOnTop"
        static let compactMode = "compactMode"
        static let largeText = "largeText"
        static let provider = "providerKind"
        static let apiKey = "apiKey" // NOTE: move to Keychain before distribution.
        static let model = "modelName"
        static let captureMode = "captureMode"
    }

    init() {
        alwaysOnTop = defaults.object(forKey: Keys.alwaysOnTop) as? Bool ?? true
        compactMode = defaults.bool(forKey: Keys.compactMode)
        largeText = defaults.bool(forKey: Keys.largeText)
        providerKind = CoachProviderKind(rawValue: defaults.string(forKey: Keys.provider) ?? "") ?? .offline
        apiKey = defaults.string(forKey: Keys.apiKey) ?? ""
        modelName = defaults.string(forKey: Keys.model) ?? CoachModelOption.defaultID
        captureMode = CaptureMode(rawValue: defaults.string(forKey: Keys.captureMode) ?? "") ?? .browserWindow

        hotkey.onTrigger = { [weak self] in
            guard let self else { return }
            Task { await self.runCapture(self.defaultCaptureSource) }
        }
        hotkey.register()

        // Provide the floating panel's SwiftUI content, injecting self.
        panel.setup { [weak self] in
            guard let self else { return AnyView(EmptyView()) }
            return AnyView(CoachPanel().environmentObject(self))
        }
        panel.setAlwaysOnTop(alwaysOnTop)
    }

    /// The active coach provider, chosen by settings. For the API provider the
    /// request is shaped by the selected model's capabilities, so switching to
    /// Sonnet or Haiku "just works".
    private var provider: CoachProvider {
        switch providerKind {
        case .offline:
            return MockProvider()
        case .api:
            let option = CoachModelOption.option(forID: modelName)
            return APIProvider(
                apiKey: apiKey,
                model: option.id,
                useAdaptiveThinking: option.supportsAdaptiveThinking,
                useEffort: option.supportsEffort
            )
        }
    }

    // MARK: Capture pipeline

    /// The capture action the hotkey performs, derived from the user's setting.
    var defaultCaptureSource: CaptureSource {
        captureMode == .browserWindow ? .browserWindow : .region
    }

    /// Run the capture pipeline for the given source, then OCR → parse → show.
    /// `.browserWindow` is fully automatic (no drag); `.region` prompts a drag;
    /// `.reuseRegion` re-captures the last region.
    func runCapture(_ source: CaptureSource) async {
        lastError = nil

        // Ensure Screen Recording permission before attempting capture.
        guard Permissions.screenRecording == .granted else {
            Permissions.requestScreenRecording()
            lastError = CaptureError.screenRecordingPermissionDenied.localizedDescription
            panel.show()
            return
        }

        // Region selection needs the UI up front (before the busy state), so it
        // is resolved first; auto/reuse go straight to capture.
        let region: CGRect?
        switch source {
        case .browserWindow:
            region = nil
        case .region:
            guard let picked = await regionSelector.selectRegion() else {
                statusMessage = "Selection cancelled."
                return
            }
            lastRegion = picked
            region = picked
        case .reuseRegion:
            guard let last = lastRegion else {
                statusMessage = "No saved region yet — capture a region once first."
                return
            }
            region = last
        }

        isBusy = true
        defer { isBusy = false }
        statusMessage = source == .browserWindow ? "Capturing browser window…" : "Capturing…"
        panel.show()

        do {
            let frame: CaptureFrame
            switch source {
            case .browserWindow:
                frame = try await capture.captureFrontmostBrowserWindow()
                lastRegion = frame.region
            case .region, .reuseRegion:
                frame = try await capture.capture(region: region!)
            }
            try await process(frame)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            statusMessage = "Capture failed."
        }
    }

    /// Shared tail: OCR the captured frame, parse it, and start a new session.
    private func process(_ frame: CaptureFrame) async throws {
        statusMessage = "Extracting text…"
        let result = try await ocr.recognize(imageAt: frame.imageURL)
        let parsed = parser.parse(result.plainText)

        let newSession = CoachSession(
            imageFileName: frame.imageURL.lastPathComponent,
            ocrText: result.plainText,
            parsedPrompt: parsed
        )
        statusMessage = newSession.parsedPrompt.isEmpty
            ? "No text found — enlarge the prompt (or zoom the page) and recapture."
            : "Prompt captured. Pick a mode to get help."

        self.ocrResult = result
        self.session = newSession
        self.draftUnlocked = false
        store.upsert(newSession)
    }

    /// Re-run OCR on the current capture (useful after correcting nothing but
    /// wanting a fresh pass, or after switching recognition settings).
    func rerunOCR() async {
        guard let name = session.imageFileName,
              let dir = try? ScreenCaptureService.imagesDirectory() else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            let result = try await ocr.recognize(imageAt: dir.appendingPathComponent(name))
            ocrResult = result
            session.ocrText = result.plainText
            session.parsedPrompt = parser.parse(result.plainText)
            store.upsert(session)
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Allow the user to hand-correct the extracted prompt, then re-parse.
    func updateCorrectedText(_ text: String) {
        session.ocrText = text
        session.parsedPrompt = parser.parse(text)
        store.upsert(session)
    }

    // MARK: Coach

    /// Generate (or regenerate) coach output for `mode`.
    func request(mode: CoachMode) async {
        selectedMode = mode
        guard !session.parsedPrompt.isEmpty else {
            lastError = CoachError.emptyPrompt.errorDescription
            return
        }
        if mode.requiresUnlock && !draftUnlocked {
            statusMessage = "Draft is locked — unlock it when you're ready to see a solution."
            return
        }

        isBusy = true
        lastError = nil
        statusMessage = "Thinking (\(mode.title))…"
        defer { isBusy = false }

        do {
            let response = try await provider.analyze(session.parsedPrompt, mode: mode, userCode: nil)
            session.responses[mode.rawValue] = response
            store.upsert(session)
            statusMessage = "\(mode.title) ready."
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            statusMessage = "\(mode.title) failed."
        }
    }

    func unlockDraft() {
        draftUnlocked = true
        Task { await request(mode: .draft) }
    }

    /// Load a previously saved session back into the panel.
    func load(_ saved: CoachSession) {
        session = saved
        draftUnlocked = saved.responses[CoachMode.draft.rawValue] != nil
        statusMessage = "Loaded: \(saved.displayTitle)"
        panel.show()
    }

    var currentResponse: CoachResponse? {
        session.responses[selectedMode.rawValue]
    }
}

extension CoachSession {
    static let empty = CoachSession()
}
