import Foundation
import Testing

@testable import AskDiaryKit

/// Validates binary parsing against the real artifacts the app will bundle.
/// Locates the repo's static/rag via #filePath, so it runs in-repo (CI/dev)
/// and quietly skips if the artifacts are ever moved.
@Suite struct RealIndexTests {
    static var ragDir: URL {
        // …/ios/AskDiaryKit/Tests/AskDiaryKitTests/RealIndexTests.swift → repo root
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // AskDiaryKitTests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // AskDiaryKit
            .deletingLastPathComponent()  // ios
            .deletingLastPathComponent()  // repo root
            .appendingPathComponent("static/rag")
    }

    static func loadReal() throws -> RagIndex {
        try RagIndex(
            indexJSON: Data(contentsOf: ragDir.appendingPathComponent("index.json")),
            embeddingsBin: Data(contentsOf: ragDir.appendingPathComponent("embeddings.bin")),
            scalesBin: Data(contentsOf: ragDir.appendingPathComponent("scales.bin")),
            youtubeJSON: try? Data(contentsOf: ragDir.appendingPathComponent("youtube.json")))
    }

    @Test func parsesTheRealArtifacts() throws {
        guard FileManager.default.fileExists(atPath: Self.ragDir.path) else { return }
        let index = try Self.loadReal()
        #expect(index.dims == 384)
        #expect(index.episodes.count == 228)
        #expect(index.chunks.count == 30308)
        #expect(index.embeddings.count == 30308 * 384)
        #expect(index.scales.count == 30308)
        #expect(!index.youtube.isEmpty)
        // every scale must be a sane positive float — catches endianness mistakes
        #expect(index.scales.allSatisfy { $0 > 0 && $0 < 1 })
    }

    @Test func selfSimilarityRanksTheRowItselfFirst() throws {
        guard FileManager.default.fileExists(atPath: Self.ragDir.path) else { return }
        let index = try Self.loadReal()
        // dequantize row 1234 and use it as the query — it must be its own top hit
        let row = 1234
        let off = row * index.dims
        let query = (0..<index.dims).map {
            Float(index.embeddings[off + $0]) * index.scales[row] / 127
        }
        let res = Vector.topK(
            query: Vector.normalize(query), corpus: index.embeddings, scales: index.scales,
            dims: index.dims, k: 3)
        #expect(res.first?.index == row)
        #expect(res.first!.score > 0.98)
    }
}
