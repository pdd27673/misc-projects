import Foundation
import CoreGraphics
import AppKit
import IOKit.hid
import ApplicationServices

/// Central place to check and request the three permission surfaces MockCoach
/// may touch, and to deep-link the user into the right System Settings pane.
enum Permissions {

    enum Status { case granted, denied, notDetermined }

    // MARK: Screen Recording (required for capture)

    /// Non-prompting check for Screen Recording access.
    static var screenRecording: Status {
        CGPreflightScreenCaptureAccess() ? .granted : .denied
    }

    /// Triggers the system prompt (and TCC entry) for Screen Recording.
    @discardableResult
    static func requestScreenRecording() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    // MARK: Input Monitoring (only if using a CGEventTap-based hotkey)

    static var inputMonitoring: Status {
        switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
        case kIOHIDAccessTypeGranted: return .granted
        case kIOHIDAccessTypeDenied: return .denied
        default: return .notDetermined
        }
    }

    @discardableResult
    static func requestInputMonitoring() -> Bool {
        IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
    }

    // MARK: Accessibility (only if advanced window management is added later)

    static var accessibility: Status {
        AXIsProcessTrusted() ? .granted : .denied
    }

    static func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    // MARK: Deep links into System Settings

    enum Pane: String {
        case screenRecording = "Privacy_ScreenCapture"
        case inputMonitoring = "Privacy_ListenEvent"
        case accessibility = "Privacy_Accessibility"
    }

    static func openSettings(_ pane: Pane) {
        let urlString = "x-apple.systempreferences:com.apple.preference.security?\(pane.rawValue)"
        if let url = URL(string: urlString) { NSWorkspace.shared.open(url) }
    }
}
