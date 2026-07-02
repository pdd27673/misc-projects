import AppKit
import SwiftUI

/// Owns the separate, non-activating floating helper panel. Kept as a distinct
/// window (not an in-window overlay) so it can be parked on a Sidecar or
/// secondary display and toggled always-on-top.
@MainActor
final class PanelController {

    private var panel: NSPanel?
    private var makeContent: (() -> AnyView)?

    /// Provide the SwiftUI content (with its environment) once, from `AppState`.
    func setup(_ content: @escaping () -> AnyView) {
        makeContent = content
    }

    /// Show (creating on first use) and bring the panel forward without
    /// stealing key focus from the coding editor.
    func show() {
        let panel = panel ?? makePanel()
        self.panel = panel
        panel.orderFrontRegardless()
    }

    func toggle() {
        if let panel, panel.isVisible { panel.orderOut(nil) } else { show() }
    }

    /// Reflect the always-on-top preference.
    func setAlwaysOnTop(_ on: Bool) {
        panel?.level = on ? .floating : .normal
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
            styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.title = "MockCoach"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .moveToActiveSpace]
        panel.center()

        if let makeContent {
            let host = NSHostingView(rootView: makeContent())
            host.autoresizingMask = [.width, .height]
            panel.contentView = host
        }
        return panel
    }
}
