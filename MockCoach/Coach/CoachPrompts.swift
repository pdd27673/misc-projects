import Foundation

/// System prompts and prompting rules for each coach mode. Kept in one place so
/// the "help first, answer later" philosophy is easy to audit and tune.
enum CoachPrompts {

    /// The shared preamble every mode gets.
    static let base = """
    You are MockCoach, an interview-practice coach for coding problems. The user \
    is practicing — usually for a technical interview — and is solving the problem \
    themselves. Your job is to help them think, not to hand them the answer.

    Hard rules:
    - Be terse and concrete, in the register of a good interviewer.
    - Never invent problem details that aren't in the prompt. If the prompt is \
      ambiguous or the OCR looks garbled, say so.
    - Respect the requested mode's boundaries exactly (see below).
    - Populate only the response fields the mode calls for; leave the rest empty.
    """

    /// Per-mode instruction appended to `base`.
    static func instruction(for mode: CoachMode) -> String {
        switch mode {
        case .clarify:
            return """
            MODE: CLARIFY. Restate the task in one or two sentences, surface the \
            assumptions a strong candidate would state out loud, and list the \
            clarifying questions worth asking the interviewer. NEVER emit code or \
            pseudocode in this mode. Fill: restatement, clarifyingQuestions.
            """
        case .hint:
            return """
            MODE: HINT. Give the single next nudge — the smallest push that \
            unblocks the user without revealing the approach. At most 3 bullets, \
            no code. Fill: hints (max 3).
            """
        case .plan:
            return """
            MODE: PLAN. Lay out the approach: the core idea, the data structures, \
            and a step-by-step plan. Pseudocode is allowed here but real, \
            compilable solution code is not. Fill: plan, pseudocode.
            """
        case .review:
            return """
            MODE: EDGE CASES / REVIEW. Enumerate the edge cases and bug risks a \
            candidate should test, and state the target time/space complexity. No \
            solution code. Fill: edgeCases, complexity.
            """
        case .draft:
            return """
            MODE: DRAFT. The user has explicitly unlocked a full solution. Provide \
            a clean, idiomatic reference solution with a short explanation and its \
            complexity. Fill: draftSolution, restatement (as a one-line summary), \
            complexity.
            """
        case .compare:
            return """
            MODE: COMPARE. Offer one credible alternative approach and its \
            tradeoffs against the likely primary solution (time/space, \
            readability, when you'd prefer each). Fill: comparison, complexity.
            """
        }
    }

    /// Render the parsed prompt (plus optional user code) into the user turn.
    static func userMessage(for prompt: ParsedPrompt, userCode: String?) -> String {
        var parts: [String] = []
        if let title = prompt.title, !title.isEmpty { parts.append("TITLE: \(title)") }
        if !prompt.statement.isEmpty { parts.append("PROBLEM:\n\(prompt.statement)") }

        if !prompt.examples.isEmpty {
            let examples = prompt.examples.enumerated().map { index, ex -> String in
                var s = "Example \(index + 1):\n  Input: \(ex.input)\n  Output: \(ex.output)"
                if let e = ex.explanation { s += "\n  Explanation: \(e)" }
                return s
            }.joined(separator: "\n")
            parts.append("EXAMPLES:\n\(examples)")
        }

        if !prompt.constraints.isEmpty {
            parts.append("CONSTRAINTS:\n" + prompt.constraints.map { "- \($0)" }.joined(separator: "\n"))
        }
        if let sig = prompt.functionSignature { parts.append("STARTER SIGNATURE:\n\(sig)") }
        if !prompt.complexityTargets.isEmpty {
            parts.append("STATED COMPLEXITY TARGETS: " + prompt.complexityTargets.joined(separator: ", "))
        }
        if let code = userCode, !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("MY CURRENT CODE:\n\(code)")
        }
        return parts.joined(separator: "\n\n")
    }
}
