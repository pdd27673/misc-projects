import Foundation

/// A lightweight, model-free parser that turns raw OCR text into a
/// `ParsedPrompt`. Running this before the coach engine reduces token waste and
/// gives the UI structured sections to render.
///
/// The parser is deliberately forgiving: OCR of code prompts is noisy, so it
/// normalizes common misreads and falls back to "everything is the statement"
/// rather than throwing away text it can't classify.
struct PromptParser {

    func parse(_ rawText: String) -> ParsedPrompt {
        let normalized = normalizeOCRArtifacts(rawText)
        let lines = normalized
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }

        var title: String?
        var statementLines: [String] = []
        var constraints: [String] = []
        var notes: [String] = []
        var exampleBuffers: [[String]] = []

        var section: Section = .statement
        var currentExample: [String] = []

        func flushExample() {
            if !currentExample.isEmpty {
                exampleBuffers.append(currentExample)
                currentExample = []
            }
        }

        for (index, line) in lines.enumerated() {
            if line.isEmpty { continue }

            // The first non-empty, heading-free short line becomes the title.
            if title == nil, index < 3, isLikelyTitle(line), classify(line) == nil {
                title = stripLeadingNumber(line)
                continue
            }

            if let heading = classify(line) {
                switch heading {
                case .example:
                    flushExample()
                    section = .example
                    // Keep any inline text after the heading, e.g. "Example 1:".
                    let remainder = stripHeading(line)
                    if !remainder.isEmpty { currentExample.append(remainder) }
                case .constraints:
                    flushExample()
                    section = .constraints
                    let remainder = stripHeading(line)
                    if !remainder.isEmpty { constraints.append(remainder) }
                case .notes:
                    flushExample()
                    section = .notes
                    let remainder = stripHeading(line)
                    if !remainder.isEmpty { notes.append(remainder) }
                }
                continue
            }

            switch section {
            case .statement:  statementLines.append(line)
            case .example:    currentExample.append(line)
            case .constraints: constraints.append(line)
            case .notes:      notes.append(line)
            }
        }
        flushExample()

        return ParsedPrompt(
            title: title,
            statement: statementLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines),
            examples: exampleBuffers.map(parseExample),
            constraints: constraints,
            functionSignature: detectFunctionSignature(in: lines),
            complexityTargets: detectComplexityTargets(in: normalized),
            notes: notes,
            rawText: rawText
        )
    }

    // MARK: - Sections

    private enum Section { case statement, example, constraints, notes }

    private enum Heading { case example, constraints, notes }

    /// Returns the heading a line introduces, if any.
    private func classify(_ line: String) -> Heading? {
        let lower = line.lowercased()
        // Match "Example", "Example 1", "Example 2:" etc.
        if lower.range(of: #"^example(\s*\d+)?\s*[:.\-]?"#, options: .regularExpression) != nil {
            return .example
        }
        if lower.hasPrefix("constraint") { return .constraints }
        if lower.hasPrefix("note") || lower.hasPrefix("follow up") || lower.hasPrefix("follow-up") {
            return .notes
        }
        return nil
    }

    private func stripHeading(_ line: String) -> String {
        line.replacingOccurrences(
            of: #"^\s*(example(\s*\d+)?|constraints?|notes?|follow[\s-]?up)\s*[:.\-]?\s*"#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        ).trimmingCharacters(in: .whitespaces)
    }

    // MARK: - Examples

    /// Split an example block into input / output / explanation using the
    /// common "Input:" / "Output:" / "Explanation:" labels.
    private func parseExample(_ block: [String]) -> PromptExample {
        var input = "", output = "", explanation = ""
        var field: Int = 0 // 0 input, 1 output, 2 explanation

        for line in block {
            let lower = line.lowercased()
            if lower.hasPrefix("input") {
                field = 0
                input += valueAfterLabel(line) + "\n"
            } else if lower.hasPrefix("output") {
                field = 1
                output += valueAfterLabel(line) + "\n"
            } else if lower.hasPrefix("explanation") {
                field = 2
                explanation += valueAfterLabel(line) + "\n"
            } else {
                switch field {
                case 0: input += line + "\n"
                case 1: output += line + "\n"
                default: explanation += line + "\n"
                }
            }
        }

        let trimmedExplanation = explanation.trimmingCharacters(in: .whitespacesAndNewlines)
        return PromptExample(
            input: input.trimmingCharacters(in: .whitespacesAndNewlines),
            output: output.trimmingCharacters(in: .whitespacesAndNewlines),
            explanation: trimmedExplanation.isEmpty ? nil : trimmedExplanation
        )
    }

    private func valueAfterLabel(_ line: String) -> String {
        guard let colon = line.firstIndex(of: ":") else { return "" }
        return String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
    }

    // MARK: - Signature & complexity

    private func detectFunctionSignature(in lines: [String]) -> String? {
        // Common starter-code signals across languages.
        let signals = ["def ", "func ", "class Solution", "public ", "function ", "fn ", "int ", "vector<"]
        return lines.first { line in
            signals.contains { line.contains($0) } && (line.contains("(") || line.contains("{"))
        }
    }

    private func detectComplexityTargets(in text: String) -> [String] {
        let pattern = #"O\s*\([^)]*\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, range: range)
        var seen = Set<String>()
        return matches.compactMap { match -> String? in
            guard let r = Range(match.range, in: text) else { return nil }
            let value = String(text[r]).replacingOccurrences(of: " ", with: "")
            return seen.insert(value).inserted ? value : nil
        }
    }

    // MARK: - Title heuristics

    private func isLikelyTitle(_ line: String) -> Bool {
        let words = line.split(separator: " ")
        // Titles are short and don't end in sentence punctuation.
        return words.count <= 8 && !line.hasSuffix(".") && !line.contains(":")
    }

    private func stripLeadingNumber(_ line: String) -> String {
        line.replacingOccurrences(of: #"^\s*\d+[\.\)]\s*"#, with: "", options: .regularExpression)
    }

    // MARK: - OCR normalization

    /// Fix the most common OCR misreads seen in monospaced coding prompts.
    /// Kept conservative so we don't corrupt legitimate text.
    private func normalizeOCRArtifacts(_ text: String) -> String {
        var result = text
        // "0(n)" / "0(1)" → "O(n)" / "O(1)" — a zero misread as capital-O
        // immediately before a parenthesis is almost always Big-O notation.
        result = result.replacingOccurrences(
            of: #"\b0(?=\()"#, with: "O", options: .regularExpression
        )
        // "O(n1og n)" — the letter-l/one confusion inside "log".
        result = result.replacingOccurrences(of: "1og", with: "log")
        // Smart quotes → straight quotes for easier downstream handling.
        result = result
            .replacingOccurrences(of: "\u{201C}", with: "\"")
            .replacingOccurrences(of: "\u{201D}", with: "\"")
            .replacingOccurrences(of: "\u{2018}", with: "'")
            .replacingOccurrences(of: "\u{2019}", with: "'")
        return result
    }
}
