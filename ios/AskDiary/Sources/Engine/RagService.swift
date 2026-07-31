import AskDiaryKit
import Foundation
import os

/// Loads the bundled index + transcripts and answers retrieval requests.
/// Everything ships in the app bundle — the app is fully offline from first launch.
actor RagService {
    static let log = Logger(subsystem: "com.davidbocle.askdiary", category: "rag")

    private var retriever: Retriever?
    private var embedder: Embedder?

    /// The FM context is 4,096 tokens. Leave room for instructions + question +
    /// answer: cap excerpt text at roughly 2,400 tokens (~4 chars/token).
    static let excerptCharBudget = 9_600

    func warmUp() throws {
        guard retriever == nil else { return }
        let bundle = Bundle.main
        guard
            let indexURL = bundle.url(forResource: "index", withExtension: "json", subdirectory: "rag"),
            let embURL = bundle.url(forResource: "embeddings", withExtension: "bin", subdirectory: "rag"),
            let scalesURL = bundle.url(forResource: "scales", withExtension: "bin", subdirectory: "rag"),
            let transcriptsDir = bundle.url(forResource: "transcripts", withExtension: nil),
            let modelURL = bundle.url(forResource: "MiniLM", withExtension: "mlmodelc"),
            let tokenizerURL = bundle.url(forResource: "tokenizer", withExtension: "json")
        else {
            throw RagError.missingBundleResources
        }
        let youtubeURL = bundle.url(forResource: "youtube", withExtension: "json", subdirectory: "rag")
        let index = try RagIndex(
            indexJSON: Data(contentsOf: indexURL),
            embeddingsBin: Data(contentsOf: embURL),
            scalesBin: Data(contentsOf: scalesURL),
            youtubeJSON: youtubeURL.flatMap { try? Data(contentsOf: $0) })
        retriever = Retriever(index: index, transcripts: DirectoryTranscriptProvider(directory: transcriptsDir))
        embedder = try Embedder(modelURL: modelURL, tokenizerJSON: Data(contentsOf: tokenizerURL))
        Self.log.info("index ready: \(index.chunks.count) chunks, \(index.episodes.count) episodes")
    }

    func retrieve(question: String, k: Int = 6) async throws -> [RetrievedChunk] {
        try warmUp()
        guard let retriever, let embedder else { throw RagError.missingBundleResources }
        let embedding = try embedder.embed(question)
        // tighter spans than the web app (gap 4 / maxSpan 24 / margin 2): the
        // FM context is 4k tokens, and six short excerpts beat one giant one
        var chunks = try await retriever.retrieve(
            queryEmbedding: embedding, k: k,
            options: RetrieveOptions(gap: 3, maxSpan: 8, margin: 1))
        // cap each excerpt (cut on a paragraph boundary where possible) so six
        // sources fit the budget — six short excerpts beat one giant one
        chunks = chunks.map { $0.capped(at: Self.excerptCharBudget / k) }
        // then trim to the total FM budget, dropping weakest excerpts first
        var total = chunks.reduce(0) { $0 + $1.text.count }
        while total > Self.excerptCharBudget, chunks.count > 1 {
            let dropped = chunks.removeLast()
            total -= dropped.text.count
        }
        Self.log.info("returning \(chunks.count) excerpts, top score \(chunks.first?.score ?? -99)")
        return chunks
    }

    enum RagError: LocalizedError {
        case missingBundleResources

        var errorDescription: String? {
            "The episode index is missing from the app bundle."
        }
    }
}

