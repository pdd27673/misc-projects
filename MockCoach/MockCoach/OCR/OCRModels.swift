import Foundation
import CoreGraphics

/// One recognized line of text from Vision, with layout so the parser can
/// reason about ordering and grouping.
struct OCRLine: Identifiable, Hashable {
    let id = UUID()
    let text: String
    /// Normalized bounding box (0...1, bottom-left origin, Vision convention).
    let boundingBox: CGRect
    let confidence: Float

    private enum CodingKeys: String, CodingKey { case text, boundingBox, confidence }
}

/// The full result of an OCR pass over a `CaptureFrame`.
struct OCRResult: Hashable {
    /// Lines in natural reading order (top-to-bottom, then left-to-right).
    let lines: [OCRLine]

    /// Lines joined with newlines — convenient for display and for feeding the
    /// parser when layout isn't needed.
    var plainText: String {
        lines.map(\.text).joined(separator: "\n")
    }

    /// Mean confidence across lines, 0...1. Useful for the "enlarge text"
    /// fallback prompt.
    var averageConfidence: Float {
        guard !lines.isEmpty else { return 0 }
        return lines.map(\.confidence).reduce(0, +) / Float(lines.count)
    }

    static let empty = OCRResult(lines: [])
}
