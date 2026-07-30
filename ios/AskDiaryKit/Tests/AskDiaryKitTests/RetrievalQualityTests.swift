import Foundation
import Testing

@testable import AskDiaryKit

/// End-to-end retrieval sanity over the real index using the real query
/// embeddings from the web stack (Fixtures/embeddings.json): the topics that
/// obviously map to an episode must surface it. Guards the whole chain —
/// binary parsing, normalization, int8 scoring, clustering — against silent
/// regressions, without needing Core ML on macOS.
@Suite struct RetrievalQualityTests {
    static func fixtureEmbeddings() throws -> [String: [Float]] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/embeddings.json")
        return try JSONDecoder().decode([String: [Float]].self, from: Data(contentsOf: url))
    }

    @Test func obviousTopicsSurfaceTheRightEpisodes() throws {
        guard FileManager.default.fileExists(atPath: RealIndexTests.ragDir.path) else { return }
        let index = try RealIndexTests.loadReal()
        let embeddings = try Self.fixtureEmbeddings()

        // question → substring the top episodes' titles must contain
        let expectations: [(question: String, titleContains: [String])] = [
            ("what did the sleep expert say about caffeine?", ["sleep", "caffeine", "walker"]),
            ("dopamine", ["dopamine", "huberman"]),
            ("training in your 60s", ["age", "fitness", "muscle", "longevity", "train"]),
        ]

        for (question, keywords) in expectations {
            let embedding = try #require(embeddings[question], "fixture missing: \(question)")
            let raw = Vector.topK(
                query: Vector.normalize(embedding),
                corpus: index.embeddings, scales: index.scales, dims: index.dims, k: 30)
            let clusters = clusterHits(
                raw, chunks: index.chunks, options: ClusterOptions(k: 6, gap: 4, maxSpan: 24))
            let titles = clusters.map { index.episodes[$0.epIdx].title.lowercased() }
            #expect(
                titles.contains { title in keywords.contains { title.contains($0) } },
                "top episodes for \(question) were: \(titles)")
        }
    }

    @Test func scoresAreSaneCosines() throws {
        guard FileManager.default.fileExists(atPath: RealIndexTests.ragDir.path) else { return }
        let index = try RealIndexTests.loadReal()
        let embeddings = try Self.fixtureEmbeddings()
        for (_, embedding) in embeddings {
            let top = Vector.topK(
                query: Vector.normalize(embedding),
                corpus: index.embeddings, scales: index.scales, dims: index.dims, k: 1)
            // vague or non-English fixture queries score low legitimately; the
            // bound only needs to catch broken scoring (zero/negative/inflated)
            let score = try #require(top.first).score
            #expect(score > 0.1 && score <= 1.001, "top score out of range: \(score)")
        }
    }
}
