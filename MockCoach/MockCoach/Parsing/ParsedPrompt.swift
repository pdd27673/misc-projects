import Foundation

/// The structured form of a coding prompt, extracted from OCR text by
/// `PromptParser` before any model is involved.
struct ParsedPrompt: Hashable, Codable {
    /// Short title / problem name, if one could be identified.
    var title: String?
    /// The main problem statement (everything before the first example/constraint).
    var statement: String
    /// Worked examples ("Example 1: Input… Output…").
    var examples: [PromptExample]
    /// Constraint lines ("1 <= n <= 10^5", "Do not use extra space", …).
    var constraints: [String]
    /// A detected function/method signature, if the prompt supplies starter code.
    var functionSignature: String?
    /// Complexity targets mentioned in the prompt, e.g. "O(n log n)".
    var complexityTargets: [String]
    /// Freeform trailing notes / follow-ups.
    var notes: [String]

    /// The raw OCR text the parse was derived from (kept for manual correction).
    var rawText: String

    static let empty = ParsedPrompt(
        title: nil,
        statement: "",
        examples: [],
        constraints: [],
        functionSignature: nil,
        complexityTargets: [],
        notes: [],
        rawText: ""
    )

    var isEmpty: Bool {
        statement.isEmpty && examples.isEmpty && constraints.isEmpty && title == nil
    }
}

/// A single worked example from the prompt.
struct PromptExample: Hashable, Codable, Identifiable {
    var id = UUID()
    var input: String
    var output: String
    var explanation: String?

    private enum CodingKeys: String, CodingKey { case input, output, explanation }
}
