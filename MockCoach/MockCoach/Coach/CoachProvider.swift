import Foundation

/// Strategy interface so the coach engine can swap between an offline stub, a
/// hosted API, or a future on-device model without the UI changing.
protocol CoachProvider {
    /// Human-readable name shown in Settings.
    var displayName: String { get }

    func analyze(
        _ prompt: ParsedPrompt,
        mode: CoachMode,
        userCode: String?
    ) async throws -> CoachResponse
}

/// Which provider the app is currently using. Persisted in settings.
enum CoachProviderKind: String, CaseIterable, Identifiable, Codable {
    case offline   // MockProvider — deterministic, no network, no key
    case api       // APIProvider — Claude Messages API

    var id: String { rawValue }

    var title: String {
        switch self {
        case .offline: return "Offline (stub)"
        case .api:     return "Claude API"
        }
    }
}
