import Foundation

/// Coach provider backed by the Claude Messages API.
///
/// Swift has no official Anthropic SDK, so this talks to the REST endpoint
/// directly with `URLSession`. It uses structured outputs
/// (`output_config.format`) so the model's reply decodes straight into
/// `CoachResponse`, and adaptive thinking for higher-quality staged reasoning.
///
/// Wire reference: https://api.anthropic.com/v1/messages
///   headers: x-api-key, anthropic-version: 2023-06-01, content-type
///   model:   claude-opus-4-8
struct APIProvider: CoachProvider {
    let displayName = "Claude API"

    /// Read from Settings (Keychain-backed in a real build; see SettingsView).
    var apiKey: String
    var model: String = CoachModelOption.defaultID

    /// Per-model request shaping. Set from `CoachModelOption` so the provider
    /// stays model agnostic — e.g. Haiku 4.5 runs with both off.
    var useAdaptiveThinking: Bool = true
    var useEffort: Bool = true

    private let endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
    private let apiVersion = "2023-06-01"

    func analyze(
        _ prompt: ParsedPrompt,
        mode: CoachMode,
        userCode: String?
    ) async throws -> CoachResponse {
        guard !apiKey.isEmpty else { throw CoachError.missingAPIKey }
        guard !prompt.isEmpty else { throw CoachError.emptyPrompt }

        let system = CoachPrompts.base + "\n\n" + CoachPrompts.instruction(for: mode)
        let userText = CoachPrompts.userMessage(for: prompt, userCode: userCode)

        let body = RequestBody(
            model: model,
            maxTokens: 8000,
            system: system,
            // Adaptive thinking and effort are gated by model capability so the
            // same code path works from Opus down to Haiku (which supports
            // neither and would 400 if they were sent).
            thinking: useAdaptiveThinking ? .init(type: "adaptive") : nil,
            outputConfig: .init(effort: useEffort ? "medium" : nil, format: .coachResponseSchema),
            messages: [.init(role: "user", content: userText)]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(apiVersion, forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else {
            throw CoachError.network("No HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "status \(http.statusCode)"
            throw CoachError.network("HTTP \(http.statusCode): \(detail)")
        }

        let apiResponse: MessagesResponse
        do {
            apiResponse = try JSONDecoder().decode(MessagesResponse.self, from: data)
        } catch {
            throw CoachError.decoding(error.localizedDescription)
        }

        // With structured outputs, the first `text` block is valid JSON matching
        // our schema. Thinking blocks (if any) precede it — skip them.
        guard let jsonText = apiResponse.content.first(where: { $0.type == "text" })?.text,
              let jsonData = jsonText.data(using: .utf8) else {
            throw CoachError.decoding("No text block in model response")
        }
        do {
            return try JSONDecoder().decode(CoachResponse.self, from: jsonData)
        } catch {
            throw CoachError.decoding("Response did not match CoachResponse: \(error.localizedDescription)")
        }
    }
}

// MARK: - Request wire types

private struct RequestBody: Encodable {
    let model: String
    let maxTokens: Int
    let system: String
    /// Omitted from the request when nil (synthesized encoding uses
    /// `encodeIfPresent` for optionals), so unsupported models don't 400.
    let thinking: Thinking?
    let outputConfig: OutputConfig
    let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case model, system, thinking, messages
        case maxTokens = "max_tokens"
        case outputConfig = "output_config"
    }

    struct Thinking: Encodable { let type: String }

    struct OutputConfig: Encodable {
        /// Omitted when nil — models without effort support (e.g. Haiku) reject it.
        let effort: String?
        let format: Format
    }

    struct Message: Encodable {
        let role: String
        let content: String
    }
}

/// The JSON-schema wrapper for structured outputs. Mirrors `CoachResponse`.
private struct Format: Encodable {
    let type = "json_schema"
    let schema: JSONSchema

    enum CodingKeys: String, CodingKey { case type, schema }

    static let coachResponseSchema = Format(schema: .coachResponse)
}

/// A minimal JSON-Schema value good enough for the coach response shape.
/// Structured outputs require `additionalProperties: false` on every object.
private struct JSONSchema: Encodable {
    static let coachResponse: JSONSchema = {
        // Encoded by hand as a dictionary tree to keep the schema readable.
        JSONSchema(raw: [
            "type": "object",
            "additionalProperties": false,
            // Optional string fields are omitted from `required`; the model
            // leaves out the ones a given mode doesn't fill. Arrays are always
            // present (possibly empty) so decoding is total.
            "properties": [
                "restatement": ["type": "string"],
                "clarifyingQuestions": ["type": "array", "items": ["type": "string"]],
                "hints": ["type": "array", "items": ["type": "string"]],
                "plan": ["type": "array", "items": ["type": "string"]],
                "pseudocode": ["type": "string"],
                "edgeCases": ["type": "array", "items": ["type": "string"]],
                "complexity": ["type": "string"],
                "draftSolution": ["type": "string"],
                "comparison": ["type": "string"]
            ],
            "required": [
                "clarifyingQuestions", "hints", "plan", "edgeCases"
            ]
        ])
    }()

    let raw: [String: Any]

    func encode(to encoder: Encoder) throws {
        try JSONSerialization.encodeAny(raw, to: encoder)
    }
}

// MARK: - Response wire types

private struct MessagesResponse: Decodable {
    let content: [Block]
    struct Block: Decodable {
        let type: String
        let text: String?
    }
}

// MARK: - Encoding helper for arbitrary JSON dictionaries

private extension JSONSerialization {
    /// Encode a `[String: Any]` tree through a Swift `Encoder`. Supports the
    /// subset used by our schema: dictionaries, arrays, strings, numbers, bools.
    static func encodeAny(_ value: Any, to encoder: Encoder) throws {
        let data = try JSONSerialization.data(withJSONObject: value)
        // Re-parse into JSONValue so it round-trips through Codable cleanly.
        let json = try JSONDecoder().decode(JSONValue.self, from: data)
        try json.encode(to: encoder)
    }
}

/// A tiny recursive JSON value used only to bridge `[String: Any]` schemas into
/// `Codable` encoding.
private enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }
}
