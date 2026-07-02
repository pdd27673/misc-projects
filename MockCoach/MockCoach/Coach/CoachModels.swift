import Foundation

/// The staged "mode ladder". The UI never jumps straight from OCR to a full
/// answer — the user climbs the ladder deliberately.
enum CoachMode: String, CaseIterable, Identifiable, Codable {
    case clarify   // restate task, assumptions, missing constraints
    case hint      // next step only, no code
    case plan      // approach, data structures, pseudocode
    case review    // complexity, edge cases, bug risks
    case draft     // optional full solution
    case compare   // alternate solution and tradeoffs

    var id: String { rawValue }

    var title: String {
        switch self {
        case .clarify: return "Clarify"
        case .hint:    return "Hint"
        case .plan:    return "Plan"
        case .review:  return "Edge Cases"
        case .draft:   return "Draft"
        case .compare: return "Compare"
        }
    }

    var systemImage: String {
        switch self {
        case .clarify: return "questionmark.circle"
        case .hint:    return "lightbulb"
        case .plan:    return "list.bullet.rectangle"
        case .review:  return "checklist"
        case .draft:   return "chevron.left.forwardslash.chevron.right"
        case .compare: return "arrow.left.arrow.right"
        }
    }

    /// Draft is gated behind an explicit "unlock" so the tool stays useful for
    /// genuine practice.
    var requiresUnlock: Bool { self == .draft }
}

/// The full structured response the coach can produce. Any given mode fills in
/// only the relevant fields.
struct CoachResponse: Hashable, Codable {
    var restatement: String?
    var clarifyingQuestions: [String]
    var hints: [String]
    var plan: [String]
    var pseudocode: String?
    var edgeCases: [String]
    var complexity: String?
    var draftSolution: String?
    /// Free-form comparison / tradeoff text for `.compare`.
    var comparison: String?

    static let empty = CoachResponse(
        restatement: nil,
        clarifyingQuestions: [],
        hints: [],
        plan: [],
        pseudocode: nil,
        edgeCases: [],
        complexity: nil,
        draftSolution: nil,
        comparison: nil
    )
}

enum CoachError: LocalizedError {
    case missingAPIKey
    case emptyPrompt
    case network(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey: return "No API key set. Add one in Settings, or switch to the offline provider."
        case .emptyPrompt:   return "There's no parsed prompt to analyze yet — capture one first."
        case .network(let m): return "Model request failed: \(m)"
        case .decoding(let m): return "Couldn't understand the model response: \(m)"
        }
    }
}
