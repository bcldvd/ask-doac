import Foundation

public struct RetrievedChunk: Sendable {
    public let episodeTitle: String
    public let episodeURL: String
    /// deep link to the episode's YouTube video at this excerpt's timestamp
    public let videoURL: URL?
    public let timestamp: String
    public let text: String
    public let score: Float

    public var source: RetrievedSource {
        RetrievedSource(episodeTitle: episodeTitle, timestamp: timestamp, text: text)
    }

    /// Shorten the excerpt to at most `maxChars`, preferring a paragraph
    /// boundary, with an ellipsis marking the cut. Keeps prompt budgets in
    /// check without dropping whole sources.
    public func capped(at maxChars: Int) -> RetrievedChunk {
        guard text.count > maxChars else { return self }
        let head = String(text.prefix(maxChars))
        let cut = head.lastIndex(of: "\n").map { String(head[..<$0]) } ?? head
        return RetrievedChunk(
            episodeTitle: episodeTitle, episodeURL: episodeURL, videoURL: videoURL,
            timestamp: timestamp, text: cut + "\n…", score: score)
    }
}

public struct RetrieveOptions: Sendable {
    public var gap: Int
    public var maxSpan: Int
    /// paragraphs of surrounding context added on each side of an excerpt
    public var margin: Int

    public init(gap: Int = 4, maxSpan: Int = 24, margin: Int = 2) {
        self.gap = gap
        self.maxSpan = maxSpan
        self.margin = margin
    }
}

/// Cosine search over the quantized index, cluster nearby hits into longer
/// excerpts, then hydrate with transcript text, padded with `margin` paragraphs
/// of surrounding context. Mirrors retrieve() in src/lib/rag/retrieve.ts.
public struct Retriever: Sendable {
    public let index: RagIndex
    public let transcripts: any TranscriptProvider

    public init(index: RagIndex, transcripts: any TranscriptProvider) {
        self.index = index
        self.transcripts = transcripts
    }

    public func retrieve(
        queryEmbedding: [Float], k: Int = 6, options: RetrieveOptions = RetrieveOptions()
    ) async throws -> [RetrievedChunk] {
        let raw = Vector.topK(
            query: Vector.normalize(queryEmbedding),
            corpus: index.embeddings, scales: index.scales, dims: index.dims, k: k * 5)
        let clusters = clusterHits(
            raw, chunks: index.chunks,
            options: ClusterOptions(k: k, gap: options.gap, maxSpan: options.maxSpan))
        var out: [RetrievedChunk] = []
        for cluster in clusters {
            let ep = index.episodes[cluster.epIdx]
            let transcript = try await transcripts.transcript(id: ep.id)
            let from = max(0, cluster.paraStart - options.margin)
            let to = min(transcript.paragraphs.count - 1, cluster.paraEnd + options.margin)
            let paras = Array(transcript.paragraphs[from...max(from, to)])
            let timestamp = paras.first?.t ?? ""
            let videoURL = index.youtube[ep.id].map { YouTube.url(videoId: $0, timestamp: timestamp) }
            out.append(
                RetrievedChunk(
                    episodeTitle: ep.title,
                    episodeURL: ep.url,
                    videoURL: videoURL,
                    timestamp: timestamp,
                    text: paras.map(\.text).joined(separator: "\n"),
                    score: cluster.score))
        }
        return out
    }
}
