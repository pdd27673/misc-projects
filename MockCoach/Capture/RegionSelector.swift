import AppKit

/// Interactive drag-to-select region picker. Presents a dim, full-screen
/// overlay; the user drags a rectangle; the selected rect is returned in global
/// screen coordinates (top-left origin) to match `ScreenCaptureService`.
@MainActor
final class RegionSelector {

    private var window: SelectorWindow?

    /// Present the overlay and await a selection. Returns `nil` if cancelled
    /// (Escape) or the drag was too small to be meaningful.
    func selectRegion() async -> CGRect? {
        await withCheckedContinuation { continuation in
            present { rect in continuation.resume(returning: rect) }
        }
    }

    private func present(completion: @escaping (CGRect?) -> Void) {
        // Cover the main screen. (A production build would span all screens.)
        guard let screen = NSScreen.main else { completion(nil); return }

        let win = SelectorWindow(
            contentRect: screen.frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false,
            screen: screen
        )
        win.level = .screenSaver
        win.backgroundColor = NSColor.black.withAlphaComponent(0.25)
        win.isOpaque = false
        win.ignoresMouseEvents = false

        let view = SelectionView(frame: screen.frame)
        view.screenFrame = screen.frame
        view.onFinish = { [weak self] rect in
            self?.window?.orderOut(nil)
            self?.window = nil
            completion(rect)
        }
        win.contentView = view
        win.makeKeyAndOrderFront(nil)
        win.makeFirstResponder(view)
        NSApp.activate(ignoringOtherApps: true)
        self.window = win
    }
}

/// Borderless key-able window (borderless windows can't become key by default).
private final class SelectorWindow: NSWindow {
    override var canBecomeKey: Bool { true }
}

/// Draws the rubber-band selection and reports the chosen rect in global,
/// top-left-origin coordinates.
private final class SelectionView: NSView {
    var onFinish: ((CGRect?) -> Void)?
    /// The screen's frame in global coordinates (bottom-left origin, AppKit).
    var screenFrame: CGRect = .zero

    private var startPoint: NSPoint?
    private var currentRect: NSRect = .zero

    override var acceptsFirstResponder: Bool { true }

    override func mouseDown(with event: NSEvent) {
        startPoint = convert(event.locationInWindow, from: nil)
        currentRect = .zero
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let start = startPoint else { return }
        let p = convert(event.locationInWindow, from: nil)
        currentRect = NSRect(
            x: min(start.x, p.x), y: min(start.y, p.y),
            width: abs(p.x - start.x), height: abs(p.y - start.y)
        )
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        defer { startPoint = nil }
        // Reject specks — likely an accidental click.
        guard currentRect.width > 8, currentRect.height > 8 else {
            onFinish?(nil); return
        }
        onFinish?(globalTopLeftRect(from: currentRect))
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { onFinish?(nil) } // Escape
    }

    /// Convert a view-local (bottom-left origin) rect to a global, top-left
    /// origin rect matching the capture/coordinate convention.
    private func globalTopLeftRect(from viewRect: NSRect) -> CGRect {
        let globalX = screenFrame.origin.x + viewRect.origin.x
        // Flip Y: AppKit bottom-left → global top-left.
        let globalYBottom = screenFrame.origin.y + viewRect.origin.y
        let topLeftY = screenFrame.maxY - (globalYBottom + viewRect.height)
        return CGRect(x: globalX, y: topLeftY, width: viewRect.width, height: viewRect.height)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard currentRect.width > 0 else { return }
        NSColor.white.withAlphaComponent(0.12).setFill()
        currentRect.fill()
        NSColor.controlAccentColor.setStroke()
        let path = NSBezierPath(rect: currentRect)
        path.lineWidth = 1.5
        path.stroke()
    }
}
