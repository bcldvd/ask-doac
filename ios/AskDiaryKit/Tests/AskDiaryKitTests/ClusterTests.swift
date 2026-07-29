import Testing

@testable import AskDiaryKit

// Ports src/lib/rag/cluster.test.ts one-for-one.

private let chunks: [(epIdx: Int, paraStart: Int, paraEnd: Int)] = [
    (0, 0, 4),  // 0
    (0, 4, 8),  // 1 — overlaps chunk 0 (shares para 4)
    (0, 10, 14),  // 2 — same episode, within gap of chunk 1
    (1, 0, 4),  // 3 — different episode, same paragraph numbers
    (1, 3, 6),  // 4 — overlaps chunk 3
    (0, 40, 44),  // 5 — same episode, far from everything
    (2, 0, 60),  // 6 — huge range
]

private func hit(_ index: Int, _ score: Float) -> Scored { Scored(index: index, score: score) }

@Suite struct ClusterHitsTests {
    @Test func mergesOverlappingHitsIntoOneWiderExcerpt() {
        let kept = clusterHits(
            [hit(0, 0.9), hit(1, 0.8)], chunks: chunks, options: .init(k: 4, gap: 3, maxSpan: 30))
        #expect(kept == [Cluster(epIdx: 0, paraStart: 0, paraEnd: 8, score: 0.9)])
    }

    @Test func mergesNearbyHitsWithinGap() {
        // chunk 2 starts 2 paragraphs after chunk 1 ends
        let kept = clusterHits(
            [hit(1, 0.9), hit(2, 0.8)], chunks: chunks, options: .init(k: 4, gap: 3, maxSpan: 30))
        #expect(kept.count == 1)
        #expect(kept[0].epIdx == 0 && kept[0].paraStart == 4 && kept[0].paraEnd == 14)
    }

    @Test func keepsDifferentEpisodesSeparate() {
        let kept = clusterHits(
            [hit(0, 0.9), hit(3, 0.8)], chunks: chunks, options: .init(k: 4, gap: 3, maxSpan: 30))
        #expect(kept.map(\.epIdx) == [0, 1])
    }

    @Test func keepsDistantHitsInSameEpisodeSeparate() {
        let kept = clusterHits(
            [hit(0, 0.9), hit(5, 0.8)], chunks: chunks, options: .init(k: 4, gap: 3, maxSpan: 30))
        #expect(kept.count == 2)
    }

    @Test func capsClustersAtKButStillDeepensExistingOnes() {
        let kept = clusterHits(
            [hit(0, 0.9), hit(3, 0.8), hit(5, 0.7), hit(1, 0.6)], chunks: chunks,
            options: .init(k: 2, gap: 3, maxSpan: 30))
        // hit(5) can't open a third cluster, but hit(1) still widens cluster 0
        #expect(kept.count == 2)
        #expect(kept[0].epIdx == 0 && kept[0].paraStart == 0 && kept[0].paraEnd == 8)
    }

    @Test func dropsHitWhoseMergeWouldExceedMaxSpan() {
        // merging chunk 0 (0–4) with chunk 5 (40–44) would span 45 paragraphs
        let kept = clusterHits(
            [hit(0, 0.9), hit(5, 0.8)], chunks: chunks, options: .init(k: 4, gap: 50, maxSpan: 30))
        #expect(kept.count == 1)
        #expect(kept[0].paraStart == 0 && kept[0].paraEnd == 4)
    }

    @Test func clustersKeepBestHitScoreAndStayBestFirst() {
        let kept = clusterHits(
            [hit(0, 0.9), hit(3, 0.8), hit(1, 0.7)], chunks: chunks,
            options: .init(k: 4, gap: 3, maxSpan: 30))
        #expect(kept.map(\.score) == [0.9, 0.8])
    }
}
