import Foundation
import CoreGraphics

/// A single captured screenshot of a screen region, plus enough metadata to
/// re-capture the same area later ("reuse last region").
struct CaptureFrame: Identifiable, Hashable {
    let id: UUID
    let createdAt: Date
    /// On-disk location of the captured PNG in Application Support.
    let imageURL: URL
    /// The display the region was captured from, when known.
    let sourceDisplayID: CGDirectDisplayID?
    /// The captured region in global (top-left origin) screen coordinates.
    let region: CGRect

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        imageURL: URL,
        sourceDisplayID: CGDirectDisplayID?,
        region: CGRect
    ) {
        self.id = id
        self.createdAt = createdAt
        self.imageURL = imageURL
        self.sourceDisplayID = sourceDisplayID
        self.region = region
    }
}

/// Errors surfaced from the capture pipeline in a form the UI can present.
enum CaptureError: LocalizedError {
    case screenRecordingPermissionDenied
    case noDisplaysAvailable
    case noBrowserWindow
    case selectionCancelled
    case captureFailed(underlying: Error)
    case couldNotWriteImage

    var errorDescription: String? {
        switch self {
        case .screenRecordingPermissionDenied:
            return "Screen Recording permission is required. Enable MockCoach in System Settings → Privacy & Security → Screen Recording."
        case .noDisplaysAvailable:
            return "No shareable displays were found."
        case .noBrowserWindow:
            return "No browser window found. Focus a browser (Safari, Chrome, Arc…) with the problem open, or switch to region capture in Settings."
        case .selectionCancelled:
            return "Region selection was cancelled."
        case .captureFailed(let underlying):
            return "Capture failed: \(underlying.localizedDescription)"
        case .couldNotWriteImage:
            return "The captured image could not be saved to disk."
        }
    }
}

/// What the hotkey does when pressed. The default is fully automatic — grab the
/// frontmost browser window with no drag.
enum CaptureMode: String, CaseIterable, Identifiable, Codable {
    /// Auto-capture the frontmost browser window (no selection).
    case browserWindow
    /// Drag to select a region.
    case region

    var id: String { rawValue }

    var title: String {
        switch self {
        case .browserWindow: return "Auto — frontmost browser window"
        case .region: return "Region — drag to select"
        }
    }
}

/// A concrete capture action requested at runtime.
enum CaptureSource {
    case browserWindow   // auto: frontmost browser window
    case region          // interactive drag
    case reuseRegion     // re-capture the last region
}
