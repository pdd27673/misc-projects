import Foundation

/// A selectable model plus the request-shaping capabilities MockCoach cares
/// about. Keeping capabilities with the model ID lets `APIProvider` stay model
/// agnostic: it builds the request from these flags rather than hard-coding
/// anything Opus-specific.
///
/// Why this matters: adaptive thinking and the `effort` parameter are only
/// valid on newer tiers. Sending either to Haiku 4.5 (or an older Sonnet)
/// returns a 400 — so the flags gate them. Structured outputs
/// (`output_config.format`) works on all presets here, so it's always on.
struct CoachModelOption: Identifiable, Hashable {
    /// The exact model ID sent to the API (also the `Identifiable` id).
    let id: String
    /// Friendly label for the Settings picker.
    let displayName: String
    /// `thinking: {type: "adaptive"}` — 4.6+ / Sonnet 5 / Fable only.
    let supportsAdaptiveThinking: Bool
    /// `output_config.effort` — Opus 4.5+, Sonnet 5/4.6, Fable (not Haiku).
    let supportsEffort: Bool

    /// Curated presets. Cheapest-capable options are first-class so testing on
    /// Haiku or running on Sonnet is one click.
    static let presets: [CoachModelOption] = [
        .init(id: "claude-opus-4-8",
              displayName: "Opus 4.8 — most capable",
              supportsAdaptiveThinking: true, supportsEffort: true),
        .init(id: "claude-sonnet-5",
              displayName: "Sonnet 5 — balanced, cheaper",
              supportsAdaptiveThinking: true, supportsEffort: true),
        .init(id: "claude-haiku-4-5",
              displayName: "Haiku 4.5 — fastest & cheapest (for testing)",
              supportsAdaptiveThinking: false, supportsEffort: false),
    ]

    static let defaultID = "claude-opus-4-8"

    /// Look up a preset by ID, or synthesize a **conservative** option for an
    /// unknown/custom ID: thinking and effort off, so a hand-typed model is as
    /// likely as possible to succeed (structured outputs still applies). This is
    /// what keeps the provider model agnostic — any ID string is usable.
    static func option(forID id: String) -> CoachModelOption {
        presets.first { $0.id == id }
            ?? CoachModelOption(id: id, displayName: "Custom (\(id))",
                                supportsAdaptiveThinking: false, supportsEffort: false)
    }

    static func isPreset(_ id: String) -> Bool {
        presets.contains { $0.id == id }
    }
}
