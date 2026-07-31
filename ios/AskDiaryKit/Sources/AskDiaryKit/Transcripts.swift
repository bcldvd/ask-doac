import Foundation

public struct Paragraph: Sendable, Codable, Equatable {
    /// timestamp like "01:15:08" or "05:42"
    public let t: String
    public let text: String

    public init(t: String, text: String) {
        self.t = t
        self.text = text
    }
}

public struct Transcript: Sendable, Codable {
    public let id: String
    public let paragraphs: [Paragraph]

    public init(id: String, paragraphs: [Paragraph]) {
        self.id = id
        self.paragraphs = paragraphs
    }
}

/// Where transcript JSON comes from. The app reads bundled files; tests inject
/// fixtures. Mirrors the web app's lazily-fetched `/transcripts/{id}.json`.
public protocol TranscriptProvider: Sendable {
    func transcript(id: String) async throws -> Transcript
}

/// Loads `<id>.json` from a directory URL (the app bundle's transcripts folder),
/// caching decoded transcripts since excerpts often share an episode.
public actor DirectoryTranscriptProvider: TranscriptProvider {
    private let directory: URL
    private var cache: [String: Transcript] = [:]

    public init(directory: URL) {
        self.directory = directory
    }

    public func transcript(id: String) async throws -> Transcript {
        if let hit = cache[id] { return hit }
        let url = directory.appendingPathComponent("\(id).json")
        let data = try Data(contentsOf: url)
        let transcript = try JSONDecoder().decode(Transcript.self, from: data)
        cache[id] = transcript
        return transcript
    }
}
