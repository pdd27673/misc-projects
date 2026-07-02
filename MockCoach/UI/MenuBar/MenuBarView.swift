import SwiftUI

/// The menu-bar popover: quick actions plus recent-session history.
struct MenuBarView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("MockCoach").font(.headline)
            Text(app.statusMessage).font(.caption).foregroundStyle(.secondary).lineLimit(2)

            Divider()

            // Primary action = the configured hotkey behavior (auto by default).
            Button {
                Task { await app.runCapture(app.defaultCaptureSource) }
            } label: {
                Label(app.captureMode == .browserWindow ? "Capture Page  (⌥⌘C)" : "Capture Region  (⌥⌘C)",
                      systemImage: app.captureMode == .browserWindow ? "macwindow" : "camera.viewfinder")
            }

            Button {
                Task { await app.runCapture(.browserWindow) }
            } label: { Label("Capture Browser Window", systemImage: "macwindow") }

            Button {
                Task { await app.runCapture(.region) }
            } label: { Label("Capture Region…", systemImage: "camera.viewfinder") }

            Button {
                Task { await app.runCapture(.reuseRegion) }
            } label: { Label("Reuse Last Region", systemImage: "arrow.clockwise.viewfinder") }
            .disabled(app.lastRegion == nil)

            Button {
                app.panel.show()
            } label: { Label("Open Helper Panel", systemImage: "macwindow.on.rectangle") }

            Divider()

            history

            Divider()

            HStack {
                Button("Settings…") { openSettings() }
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
            .font(.callout)
        }
        .padding(12)
        .frame(width: 300)
    }

    @ViewBuilder private var history: some View {
        Text("RECENT").font(.caption2).foregroundStyle(.secondary)
        if app.store.sessions.isEmpty {
            Text("No captures yet.").font(.caption).foregroundStyle(.tertiary)
        } else {
            ForEach(app.store.sessions.prefix(6)) { s in
                Button {
                    app.load(s)
                } label: {
                    HStack {
                        Text(s.displayTitle).lineLimit(1)
                        Spacer()
                        Text(s.createdAt, style: .time).foregroundStyle(.tertiary)
                    }
                    .font(.callout)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
