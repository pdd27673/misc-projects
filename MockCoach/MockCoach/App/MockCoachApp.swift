import SwiftUI
import SwiftData

/// Entry point for the MockCoach menubar agent.
///
/// The app has no primary window. It lives in the menu bar and drives a
/// separate, non-activating floating panel (see `PanelController`) that can be
/// parked on a Sidecar display. A `Settings` scene provides preferences.
@main
struct MockCoachApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    /// Shared, observable app state injected into every SwiftUI surface.
    @StateObject private var appState = AppState()

    var body: some Scene {
        // Menu bar entry. `MenuBarExtra` gives us the status item + popover.
        MenuBarExtra("MockCoach", systemImage: "brain.head.profile") {
            MenuBarView()
                .environmentObject(appState)
        }
        .menuBarExtraStyle(.window)

        // Standard preferences window (⌘,).
        Settings {
            SettingsView()
                .environmentObject(appState)
        }
    }
}

/// AppKit delegate used for lifecycle wiring that SwiftUI scenes can't express:
/// the non-activating floating panel and the global hotkey.
final class AppDelegate: NSObject, NSApplicationDelegate {
    /// Populated by `MockCoachApp` once the environment object exists.
    static weak var appState: AppState?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Menubar agents should never steal focus on launch.
        NSApp.setActivationPolicy(.accessory)
    }
}
