import Foundation

/// One saved practice session: the capture, the extracted text, the parsed
/// prompt, and any coach responses generated for it, keyed by mode.
///
/// Stored as Codable JSON by `SessionStore`. (SwiftData or SQLite would also be
/// fine here; JSON keeps v1 dependency-light and the record easy to inspect.)
struct CoachSession: Identifiable, Codable, Hashable {
    let id: UUID
    var createdAt: Date
    /// Filename (not full path) of the capture PNG within the images directory,
    /// so the store stays portable if the container moves.
    var imageFileName: String?
    var ocrText: String
    var parsedPrompt: ParsedPrompt
    /// Coach responses generated so far, keyed by mode raw value.
    var responses: [String: CoachResponse]

    init(
        id: UUID = UUID(),
        createdAt: Date = Date(),
        imageFileName: String? = nil,
        ocrText: String = "",
        parsedPrompt: ParsedPrompt = .empty,
        responses: [String: CoachResponse] = [:]
    ) {
        self.id = id
        self.createdAt = createdAt
        self.imageFileName = imageFileName
        self.ocrText = ocrText
        self.parsedPrompt = parsedPrompt
        self.responses = responses
    }

    /// A short label for the session list.
    var displayTitle: String {
        if let t = parsedPrompt.title, !t.isEmpty { return t }
        let firstLine = ocrText.split(separator: "\n").first.map(String.init) ?? "Untitled capture"
        return String(firstLine.prefix(48))
    }
}
