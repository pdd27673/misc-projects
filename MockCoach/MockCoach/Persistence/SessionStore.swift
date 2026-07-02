import Foundation

/// Persists `CoachSession` records as a single JSON file in Application Support,
/// with capture images kept alongside in the Captures directory.
@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var sessions: [CoachSession] = []

    private let fileURL: URL
    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return e
    }()
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init() {
        // Reuse the Captures parent folder for the index file.
        let dir = (try? ScreenCaptureService.imagesDirectory().deletingLastPathComponent())
            ?? FileManager.default.temporaryDirectory
        self.fileURL = dir.appendingPathComponent("sessions.json")
        load()
    }

    // MARK: CRUD

    /// Insert a new session or replace an existing one with the same id.
    func upsert(_ session: CoachSession) {
        if let idx = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[idx] = session
        } else {
            sessions.insert(session, at: 0) // newest first
        }
        save()
    }

    func delete(_ session: CoachSession) {
        sessions.removeAll { $0.id == session.id }
        if let name = session.imageFileName,
           let dir = try? ScreenCaptureService.imagesDirectory() {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
        }
        save()
    }

    // MARK: Disk

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        sessions = (try? decoder.decode([CoachSession].self, from: data)) ?? []
    }

    private func save() {
        do {
            let data = try encoder.encode(sessions)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Persistence failures are non-fatal for an interview aid; surface
            // via the console rather than interrupting the session.
            NSLog("SessionStore save failed: \(error.localizedDescription)")
        }
    }
}
