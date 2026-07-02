import Foundation

/// A deterministic, offline coach provider. Ships so the full capture → OCR →
/// parse → coach → render loop can be exercised without an API key. It echoes
/// the parsed prompt back through simple heuristics rather than calling a model.
struct MockProvider: CoachProvider {
    let displayName = "Offline (stub)"

    func analyze(
        _ prompt: ParsedPrompt,
        mode: CoachMode,
        userCode: String?
    ) async throws -> CoachResponse {
        guard !prompt.isEmpty else { throw CoachError.emptyPrompt }

        // A touch of latency so the UI's loading state is exercised.
        try? await Task.sleep(nanoseconds: 250_000_000)

        let title = prompt.title ?? "this problem"
        var r = CoachResponse.empty

        switch mode {
        case .clarify:
            r.restatement = "You're asked to solve \(title). " +
                (prompt.statement.isEmpty ? "" : String(prompt.statement.prefix(200)))
            r.clarifyingQuestions = [
                "What are the input size bounds?",
                "Can the input be empty or contain duplicates?",
                prompt.complexityTargets.isEmpty
                    ? "Is there a target time/space complexity?"
                    : "Confirm the target is \(prompt.complexityTargets.joined(separator: ", "))."
            ]
        case .hint:
            r.hints = [
                "Restate the problem in one sentence before you start.",
                "What's the brute-force approach, and where does it waste work?",
                "Is there structure (sorting, hashing, two pointers) that removes that waste?"
            ]
        case .plan:
            r.plan = [
                "State the invariant your solution maintains.",
                "Pick the data structure that makes lookups/updates cheap.",
                "Walk one example through your plan before coding."
            ]
            r.pseudocode = "// sketch\nfor each element:\n    update state\n    check answer"
        case .review:
            r.edgeCases = [
                "Empty input",
                "Single element",
                "All elements equal / duplicates",
                "Maximum-size input (watch for overflow)"
            ]
            r.complexity = prompt.complexityTargets.first ?? "Aim to state Big-O for time and space."
        case .draft:
            r.restatement = "Reference solution for \(title)."
            r.draftSolution = "// Offline provider does not generate solutions.\n" +
                "// Add an API key in Settings and switch to the Claude provider."
            r.complexity = "See the model-backed provider for a real analysis."
        case .compare:
            r.comparison = "Offline provider: a real comparison needs the model-backed provider."
        }
        return r
    }
}
