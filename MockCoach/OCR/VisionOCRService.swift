import Foundation
import Vision
import CoreGraphics
import ImageIO

/// On-device OCR over a captured image using Apple's Vision framework
/// (`VNRecognizeTextRequest`). Returns structured lines in reading order.
struct VisionOCRService {

    enum OCRError: LocalizedError {
        case couldNotLoadImage
        case recognitionFailed(Error)

        var errorDescription: String? {
            switch self {
            case .couldNotLoadImage: return "The captured image could not be loaded for OCR."
            case .recognitionFailed(let e): return "Text recognition failed: \(e.localizedDescription)"
            }
        }
    }

    /// Recognize text in the image at `url`.
    func recognize(imageAt url: URL) async throws -> OCRResult {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw OCRError.couldNotLoadImage
        }
        return try await recognize(cgImage: cgImage)
    }

    func recognize(cgImage: CGImage) async throws -> OCRResult {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error { continuation.resume(throwing: OCRError.recognitionFailed(error)); return }
                let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
                let lines: [OCRLine] = observations.compactMap { obs in
                    guard let top = obs.topCandidates(1).first else { return nil }
                    return OCRLine(text: top.string, boundingBox: obs.boundingBox, confidence: top.confidence)
                }
                continuation.resume(returning: OCRResult(lines: Self.readingOrder(lines)))
            }

            // Coding prompts are dense monospace — accuracy over speed, and no
            // language correction so identifiers aren't "fixed" into words.
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            // Vision work off the calling actor.
            DispatchQueue.global(qos: .userInitiated).async {
                do { try handler.perform([request]) }
                catch { continuation.resume(throwing: OCRError.recognitionFailed(error)) }
            }
        }
    }

    /// Vision returns observations bottom-left origin and not strictly ordered.
    /// Sort top-to-bottom, then left-to-right so downstream parsing sees natural
    /// reading order.
    private static func readingOrder(_ lines: [OCRLine]) -> [OCRLine] {
        lines.sorted { a, b in
            // Higher `minY` is nearer the top (bottom-left origin).
            if abs(a.boundingBox.minY - b.boundingBox.minY) > 0.01 {
                return a.boundingBox.minY > b.boundingBox.minY
            }
            return a.boundingBox.minX < b.boundingBox.minX
        }
    }
}
