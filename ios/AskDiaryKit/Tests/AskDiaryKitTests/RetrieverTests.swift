import Foundation
import Testing

@testable import AskDiaryKit

/// In-memory provider so retrieval is tested without bundle plumbing.
struct StubTranscripts: TranscriptProvider {
    let transcripts: [String: Transcript]

    func transcript(id: String) async throws -> Transcript {
        guard let t = transcripts[id] else { throw CocoaError(.fileNoSuchFile) }
        return t
    }
}

@Suite struct RetrieverTests {
    // One episode, 12 paragraphs; two chunks — paras 2-4 about caffeine, 8-10 about money.
    static func makeIndex() -> RagIndex {
        let dims = 4
        let caffeine: [Float] = Vector.normalize([1, 0, 0, 0])
        let money: [Float] = Vector.normalize([0, 1, 0, 0])
        var flat: [Int8] = []
        var scales: [Float] = []
        for v in [caffeine, money] {
            let (q, s) = Vector.quantize(v)
            flat.append(contentsOf: q)
            scales.append(s)
        }
        return RagIndex(
            dims: dims,
            episodes: [Episode(id: "ep1", title: "Sleep Expert", url: "https://example.com/ep1")],
            chunks: [(0, 2, 4), (0, 8, 10)],
            embeddings: flat,
            scales: scales,
            youtube: ["ep1": "vid42"])
    }

    static func makeTranscript() -> Transcript {
        Transcript(
            id: "ep1",
            paragraphs: (0..<12).map { Paragraph(t: "00:\(String(format: "%02d", $0))", text: "para \($0)") })
    }

    @Test func hydratesBestClusterWithMarginAndDeepLink() async throws {
        let retriever = Retriever(
            index: Self.makeIndex(),
            transcripts: StubTranscripts(transcripts: ["ep1": Self.makeTranscript()]))
        let out = try await retriever.retrieve(
            queryEmbedding: [1, 0.05, 0, 0], k: 1, options: RetrieveOptions(gap: 1, maxSpan: 6, margin: 2))
        #expect(out.count == 1)
        let top = try #require(out.first)
        #expect(top.episodeTitle == "Sleep Expert")
        // chunk paras 2-4 padded by margin 2 → paras 0-6
        #expect(top.text == (0...6).map { "para \($0)" }.joined(separator: "\n"))
        #expect(top.timestamp == "00:00")
        // 00:00 → no &t= suffix
        #expect(top.videoURL?.absoluteString == "https://www.youtube.com/watch?v=vid42")
    }

    @Test func clampsMarginAtTranscriptEnd() async throws {
        let retriever = Retriever(
            index: Self.makeIndex(),
            transcripts: StubTranscripts(transcripts: ["ep1": Self.makeTranscript()]))
        let out = try await retriever.retrieve(
            queryEmbedding: [0, 1, 0, 0], k: 1, options: RetrieveOptions(gap: 1, maxSpan: 6, margin: 3))
        let top = try #require(out.first)
        // chunk paras 8-10 padded by 3 → 5..11 (clamped to last paragraph)
        #expect(top.text.hasSuffix("para 11"))
        #expect(top.timestamp == "00:05")
        // fixture timestamps are MM:SS — "00:05" is 5 seconds in
        #expect(top.videoURL?.absoluteString == "https://www.youtube.com/watch?v=vid42&t=5s")
    }
}
