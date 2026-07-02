import SwiftUI

/// The two-pane helper panel: capture/prompt on the left, staged coach output
/// on the right. Designed to stay readable when parked on a Sidecar display.
struct CoachPanel: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()
            HSplitView {
                PromptPreviewView()
                    .frame(minWidth: 240)
                CoachOutputView()
                    .frame(minWidth: 300)
            }
            Divider()
            statusBar
        }
        .frame(minWidth: 560, minHeight: 360)
        .environment(\.dynamicTypeSize, app.largeText ? .accessibility2 : .large)
    }

    // MARK: Toolbar

    private var toolbar: some View {
        HStack(spacing: 8) {
            Button {
                Task { await app.runCapture(.browserWindow) }
            } label: { Label("Capture Page", systemImage: "macwindow") }
            .help("Auto-capture the frontmost browser window")

            Button {
                Task { await app.runCapture(.region) }
            } label: { Label("Region", systemImage: "camera.viewfinder") }
            .help("Drag to select a region")

            Button {
                Task { await app.runCapture(.reuseRegion) }
            } label: { Label("Reuse", systemImage: "arrow.clockwise.viewfinder") }
            .disabled(app.lastRegion == nil)
            .help("Re-capture the last region")

            Button {
                Task { await app.rerunOCR() }
            } label: { Label("Re-run OCR", systemImage: "text.viewfinder") }
            .disabled(app.session.imageFileName == nil)

            Spacer()

            Toggle(isOn: $app.alwaysOnTop) {
                Image(systemName: "pin")
            }
            .toggleStyle(.button)
            .help("Keep panel on top")

            Toggle(isOn: $app.compactMode) {
                Image(systemName: "rectangle.compress.vertical")
            }
            .toggleStyle(.button)
            .help("Compact mode for Sidecar")
        }
        .padding(8)
    }

    // MARK: Status

    private var statusBar: some View {
        HStack(spacing: 8) {
            if app.isBusy { ProgressView().controlSize(.small) }
            Text(app.lastError ?? app.statusMessage)
                .font(.callout)
                .foregroundStyle(app.lastError == nil ? .secondary : Color.red)
                .lineLimit(2)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
    }
}
