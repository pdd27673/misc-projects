import SwiftUI

/// Preferences: model provider, hotkey/permissions, and OCR/UX toggles.
struct SettingsView: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        TabView {
            modelTab.tabItem { Label("Model", systemImage: "brain") }
            permissionsTab.tabItem { Label("Permissions", systemImage: "lock.shield") }
            appearanceTab.tabItem { Label("Display", systemImage: "textformat.size") }
        }
        .frame(width: 460, height: 320)
        .padding()
    }

    // MARK: Model

    private var modelTab: some View {
        Form {
            Picker("Coach provider", selection: $app.providerKind) {
                ForEach(CoachProviderKind.allCases) { Text($0.title).tag($0) }
            }
            if app.providerKind == .api {
                TextField("Model ID", text: $app.modelName)
                SecureField("API key", text: $app.apiKey)
                Text("The key is stored in UserDefaults in this scaffold — move it to the Keychain before distribution.")
                    .font(.caption).foregroundStyle(.secondary)
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
