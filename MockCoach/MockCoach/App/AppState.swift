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
    }

    init() {
        alwaysOnTop = defaults.object(forKey: Keys.alwaysOnTop) as? Bool ?? true
        compactMode = defaults.bool(forKey: Keys.compactMode)
        largeText = defaults.bool(forKey: Keys.largeText)
        providerKind = CoachProviderKind(rawValue: defaults.string(forKey: Keys.provider) ?? "") ?? .offline
        apiKey = defaults.string(forKey: Keys.apiKey) ?? ""
        modelName = defaults.string(forKey: Keys.model) ?? "claude-opus-4-8"

        hotkey.onTrigger = { [weak self] in
            Task { await self?.runCaptureFlow(reuseRegion: false) }
        }
        hotkey.register()

        // Provide the floating panel's SwiftUI content, injecting self.
        panel.setup { [weak self] in
            guard let self else { return AnyView(EmptyView()) }
            return AnyView(CoachPanel().environmentObject(self))
        }
        panel.setAlwaysOnTop(alwaysOnTop)
    }

    /// The active coach provider, chosen by settings.
    private var provider: CoachProvider {
        switch providerKind {
        case .offline: return MockProvider()
        case .api: return APIProvider(apiKey: apiKey, model: modelName)
        }
    }

    // MARK: Capture pipeline

    /// The full first-milestone loop: pick (or reuse) a region, capture, OCR,
    /// parse, and show the panel. Coach output is generated on demand per mode.
    func runCaptureFlow(reuseRegion: Bool) async {
        lastError = nil

        // Ensure Screen Recording permission before attempting capture.
        guard Permissions.screenRecording == .granted else {
            Permissions.requestScreenRecording()
            lastError = CaptureError.screenRecordingPermissionDenied.localizedDescription
            panel.show()
            return
        }

        let region: CGRect
        if reuseRegion, let last = lastRegion {
            region = last
        } else {
            guard let picked = await regionSelector.selectRegion() else {
                statusMessage = "Selection cancelled."
                return
            }
            region = picked
            lastRegion = picked
        }

        isBusy = true
        statusMessage = "Capturing…"
        panel.show()

        do {
            let frame = try await capture.capture(region: region)
            statusMessage = "Extracting text…"
            let result = try await ocr.recognize(imageAt: frame.imageURL)
            let parsed = parser.parse(result.plainText)

            var newSession = CoachSession(
                imageFileName: frame.imageURL.lastPathComponent,
                ocrText: result.plainText,
                parsedPrompt: parsed
            )
            if newSession.parsedPrompt.isEmpty {
                statusMessage = "No text found — try enlarging the prompt and recapturing."
            } else {
                statusMessage = "Prompt captured. Pick a mode to get help."
            }

            self.ocrResult = result
            self.session = newSession
            self.draftUnlocked = false
            store.upsert(newSession)
            _ = newSession // stored
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            statusMessage = "Capture failed."
        }
        isBusy = false
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
