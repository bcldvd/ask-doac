import Foundation

public struct Episode: Sendable, Codable, Equatable {
    public let id: String
    public let title: String
    public let url: String

    public init(id: String, title: String, url: String) {
        self.id = id
        self.title = title
        self.url = url
    }
}

/// Mirrors the web app's RagIndex: metadata from index.json plus the two flat
/// binary artifacts, all built by scripts/rag/build-index.mjs and bundled as-is.
public struct RagIndex: Sendable {
    public let dims: Int
    public let episodes: [Episode]
    /// per chunk: (episodeIdx, paraStart, paraEnd)
    public let chunks: [(epIdx: Int, paraStart: Int, paraEnd: Int)]
    public let embeddings: [Int8]
    public let scales: [Float]
    /// episodeId → YouTube video id
    public let youtube: [String: String]

    public init(
        dims: Int,
        episodes: [Episode],
        chunks: [(epIdx: Int, paraStart: Int, paraEnd: Int)],
        embeddings: [Int8],
        scales: [Float],
        youtube: [String: String]
    ) {
        self.dims = dims
        self.episodes = episodes
        self.chunks = chunks
        self.embeddings = embeddings
        self.scales = scales
        self.youtube = youtube
    }
}

extension RagIndex {
    struct Meta: Codable {
        let dims: Int
        let episodes: [Episode]
        let chunks: [[Int]]
    }

    public enum LoadError: Error, CustomStringConvertible {
        case corrupt(String)

        public var description: String {
            switch self {
            case .corrupt(let what): return "episode index failed to load: \(what)"
            }
        }
    }

    /// Decode the three bundled artifacts. `scales.bin` is little-endian Float32,
    /// `embeddings.bin` raw int8, one row of `dims` values per chunk.
    public init(indexJSON: Data, embeddingsBin: Data, scalesBin: Data, youtubeJSON: Data?) throws {
        let meta = try JSONDecoder().decode(Meta.self, from: indexJSON)
        guard scalesBin.count % MemoryLayout<Float>.size == 0 else {
            throw LoadError.corrupt("scales.bin size \(scalesBin.count) is not a multiple of 4")
        }
        let embeddings = embeddingsBin.withUnsafeBytes { [Int8]($0.bindMemory(to: Int8.self)) }
        let scales = scalesBin.withUnsafeBytes {
            $0.bindMemory(to: UInt32.self).map { Float(bitPattern: UInt32(littleEndian: $0)) }
        }
        guard embeddings.count == meta.chunks.count * meta.dims else {
            throw LoadError.corrupt(
                "embeddings.bin has \(embeddings.count) values, expected \(meta.chunks.count * meta.dims)")
        }
        guard scales.count == meta.chunks.count else {
            throw LoadError.corrupt("scales.bin has \(scales.count) rows, expected \(meta.chunks.count)")
        }
        let youtube = youtubeJSON.flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } ?? [:]
        self.init(
            dims: meta.dims,
            episodes: meta.episodes,
            chunks: meta.chunks.map { (epIdx: $0[0], paraStart: $0[1], paraEnd: $0[2]) },
            embeddings: embeddings,
            scales: scales,
            youtube: youtube
        )
    }
}
