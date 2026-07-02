import Foundation
import ScreenCaptureKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import AppKit

/// Captures a region of the screen with ScreenCaptureKit and writes it to the
/// app-support images folder, returning a `CaptureFrame`.
///
/// ScreenCaptureKit is the supported high-performance capture path on modern
/// macOS. Capturing requires Screen Recording permission (see `Permissions`).
struct ScreenCaptureService {

    /// Capture `region` (global screen coordinates, top-left origin) and persist
    /// the PNG. Returns metadata describing the capture.
    func capture(region: CGRect) async throws -> CaptureFrame {
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            // Permission errors surface here as a thrown error.
            throw CaptureError.screenRecordingPermissionDenied
        }

        guard let (display, nsScreen) = displayContaining(region, in: content) else {
            throw CaptureError.noDisplaysAvailable
        }

        // Convert the global region to display-local points (top-left origin),
        // which is what SCStreamConfiguration.sourceRect expects.
        let localRect = CGRect(
            x: region.origin.x - nsScreen.frame.origin.x,
            y: region.origin.y - nsScreen.frame.origin.y,
            width: region.width,
            height: region.height
        )

        let scale = nsScreen.backingScaleFactor
        let config = SCStreamConfiguration()
        config.sourceRect = localRect
        config.width = Int(localRect.width * scale)
        config.height = Int(localRect.height * scale)
        config.showsCursor = false

        let filter = SCContentFilter(display: display, excludingWindows: [])

        let image: CGImage
        do {
            image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        } catch {
            throw CaptureError.captureFailed(underlying: error)
        }

        let url = try write(image)
        return CaptureFrame(imageURL: url, sourceDisplayID: display.displayID, region: region)
    }

    // MARK: - Automatic browser-window capture

    /// Capture the frontmost browser window with no user selection. This is the
    /// default "just press the hotkey" path: whatever page is open in the
    /// focused browser gets captured whole, and it needs no coordinate math
    /// because ScreenCaptureKit captures the window directly.
    func captureFrontmostBrowserWindow() async throws -> CaptureFrame {
        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw CaptureError.screenRecordingPermissionDenied
        }

        guard let window = frontmostBrowserWindow(in: content) else {
            throw CaptureError.noBrowserWindow
        }

        let scale = screenScale(forWindowCenter: CGPoint(x: window.frame.midX, y: window.frame.midY))
        let config = SCStreamConfiguration()
        config.width = max(1, Int(window.frame.width * scale))
        config.height = max(1, Int(window.frame.height * scale))
        config.showsCursor = false
        config.ignoreShadowsSingleWindow = true

        let filter = SCContentFilter(desktopIndependentWindow: window)

        let image: CGImage
        do {
            image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        } catch {
            throw CaptureError.captureFailed(underlying: error)
        }

        let url = try write(image)
        return CaptureFrame(imageURL: url, sourceDisplayID: nil, region: window.frame)
    }

    /// Bundle IDs of common macOS browsers.
    private static let browserBundleIDs: Set<String> = [
        "com.apple.Safari",
        "com.apple.SafariTechnologyPreview",
        "com.google.Chrome",
        "com.google.Chrome.canary",
        "com.microsoft.edgemac",
        "com.brave.Browser",
        "company.thebrowser.Browser",   // Arc
        "company.thebrowser.dia",       // Dia
        "org.mozilla.firefox",
        "org.mozilla.firefoxdeveloperedition",
        "com.operasoftware.Opera",
        "com.vivaldi.Vivaldi",
        "ai.perplexity.comet",
    ]

    /// Pick the best browser window to capture: prefer the frontmost app's
    /// windows, then the largest (the main page, not a small popup).
    private func frontmostBrowserWindow(in content: SCShareableContent) -> SCWindow? {
        let frontAppID = NSWorkspace.shared.frontmostApplication?.bundleIdentifier

        let browserWindows = content.windows.filter { window in
            guard window.isOnScreen,
                  window.windowLayer == 0,                 // normal windows only
                  let bundleID = window.owningApplication?.bundleIdentifier,
                  Self.browserBundleIDs.contains(bundleID) else { return false }
            // Ignore tiny/utility windows (find bars, dialogs).
            return window.frame.width > 200 && window.frame.height > 200
        }

        // Prefer the focused browser; otherwise consider every browser window.
        let preferred = browserWindows.filter { $0.owningApplication?.bundleIdentifier == frontAppID }
        let pool = preferred.isEmpty ? browserWindows : preferred

        return pool.max { area($0.frame) < area($1.frame) }
    }

    private func area(_ r: CGRect) -> CGFloat { r.width * r.height }

    private func screenScale(forWindowCenter center: CGPoint) -> CGFloat {
        NSScreen.screens.first { $0.frame.contains(center) }?.backingScaleFactor
            ?? NSScreen.main?.backingScaleFactor
            ?? 2
    }

    // MARK: - Display resolution

    private func displayContaining(
        _ region: CGRect,
        in content: SCShareableContent
    ) -> (SCDisplay, NSScreen)? {
        let center = CGPoint(x: region.midX, y: region.midY)
        for display in content.displays {
            guard let screen = NSScreen.screens.first(where: {
                ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display.displayID
            }) else { continue }
            if screen.frame.contains(center) { return (display, screen) }
        }
        // Fall back to the first display so a mis-mapped region still captures.
        if let display = content.displays.first,
           let screen = NSScreen.screens.first {
            return (display, screen)
        }
        return nil
    }

    // MARK: - Persistence

    private func write(_ image: CGImage) throws -> URL {
        let dir = try Self.imagesDirectory()
        let url = dir.appendingPathComponent("\(UUID().uuidString).png")
        guard let dest = CGImageDestinationCreateWithURL(
            url as CFURL, UTType.png.identifier as CFString, 1, nil
        ) else {
            throw CaptureError.couldNotWriteImage
        }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { throw CaptureError.couldNotWriteImage }
        return url
    }

    /// `~/Library/Application Support/MockCoach/Captures`.
    static func imagesDirectory() throws -> URL {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        )
        let dir = support.appendingPathComponent("MockCoach/Captures", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}
