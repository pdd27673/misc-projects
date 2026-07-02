import SwiftUI

/// Preferences: model provider, hotkey/permissions, and OCR/UX toggles.
struct SettingsView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        TabView {
            captureTab.tabItem { Label("Capture", systemImage: "camera.viewfinder") }
            modelTab.tabItem { Label("Model", systemImage: "brain") }
            permissionsTab.tabItem { Label("Permissions", systemImage: "lock.shield") }
            appearanceTab.tabItem { Label("Display", systemImage: "textformat.size") }
        }
        .frame(width: 460, height: 340)
        .padding()
    }

    // MARK: Capture

    private var captureTab: some View {
        Form {
            Picker("Hotkey capture", selection: $app.captureMode) {
                ForEach(CaptureMode.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.radioGroup)

            switch app.captureMode {
            case .browserWindow:
                Text("Pressing ⌥⌘C captures the frontmost browser window automatically — no dragging. Open the problem in Safari, Chrome, Arc, etc., and the whole page is read.")
                    .font(.caption).foregroundStyle(.secondary)
                Text("Because the whole window is captured, some page chrome (tabs, sidebars) may show up in the OCR — use the Clarify view or the prompt's \"Correct…\" editor to trim it.")
                    .font(.caption).foregroundStyle(.tertiary)
            case .region:
                Text("Pressing ⌥⌘C lets you drag a box around just the problem. More precise, but requires a selection each time.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            LabeledContent("Hotkey") { Text("⌥⌘C") }
        }
    }

    // MARK: Model

    /// Sentinel tag for "type your own model ID".
    private static let customTag = "__custom__"

    private var modelSelection: Binding<String> {
        Binding(
            get: { CoachModelOption.isPreset(app.modelName) ? app.modelName : Self.customTag },
            set: { newValue in
                // Selecting a preset sets the ID directly; "Custom…" leaves the
                // current (possibly custom) value in place for the text field.
                if newValue != Self.customTag { app.modelName = newValue }
                else if CoachModelOption.isPreset(app.modelName) { app.modelName = "" }
            }
        )
    }

    private var modelTab: some View {
        Form {
            Picker("Coach provider", selection: $app.providerKind) {
                ForEach(CoachProviderKind.allCases) { Text($0.title).tag($0) }
            }

            if app.providerKind == .api {
                Picker("Model", selection: modelSelection) {
                    ForEach(CoachModelOption.presets) { Text($0.displayName).tag($0.id) }
                    Divider()
                    Text("Custom…").tag(Self.customTag)
                }

                // Always available so any model ID works — the app is model
                // agnostic; presets are just conveniences.
                TextField("Model ID", text: $app.modelName, prompt: Text("e.g. claude-sonnet-5"))
                    .textFieldStyle(.roundedBorder)

                SecureField("API key", text: $app.apiKey)
                Text("Haiku 4.5 is great for cheap testing; Sonnet 5 is a good balance. Adaptive thinking and effort are enabled automatically only for models that support them, so switching models won't cause errors.")
                    .font(.caption).foregroundStyle(.secondary)
                Text("The key is stored in UserDefaults in this scaffold — move it to the Keychain before distribution.")
                    .font(.caption).foregroundStyle(.tertiary)
            } else {
                Text("The offline provider returns deterministic guidance and needs no key — good for exercising the full pipeline.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Permissions

    private var permissionsTab: some View {
        Form {
            permissionRow(
                title: "Screen Recording",
                subtitle: "Required to capture the problem.",
                status: Permissions.screenRecording,
                request: { Permissions.requestScreenRecording() },
                pane: .screenRecording
            )
            permissionRow(
                title: "Input Monitoring",
                subtitle: "Only needed for a CGEventTap hotkey. The default Carbon hotkey doesn't require it.",
                status: Permissions.inputMonitoring,
                request: { Permissions.requestInputMonitoring() },
                pane: .inputMonitoring
            )
            LabeledContent("Global hotkey") { Text("⌥⌘C") }
        }
    }

    private func permissionRow(
        title: String,
        subtitle: String,
        status: Permissions.Status,
        request: @escaping () -> Void,
        pane: Permissions.Pane
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(title)
                statusBadge(status)
                Spacer()
                Button("Request") { request() }
                Button("Open Settings") { Permissions.openSettings(pane) }
            }
            Text(subtitle).font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private func statusBadge(_ status: Permissions.Status) -> some View {
        let (text, color): (String, Color) = {
            switch status {
            case .granted: return ("Granted", .green)
            case .denied: return ("Denied", .red)
            case .notDetermined: return ("Not set", .orange)
            }
        }()
        return Text(text).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.15)).foregroundStyle(color).clipShape(Capsule())
    }

    // MARK: Appearance

    private var appearanceTab: some View {
        Form {
            Toggle("Keep panel always on top", isOn: $app.alwaysOnTop)
            Toggle("Compact mode (for Sidecar)", isOn: $app.compactMode)
            Toggle("Large text (for tablet viewing)", isOn: $app.largeText)
        }
    }
}
