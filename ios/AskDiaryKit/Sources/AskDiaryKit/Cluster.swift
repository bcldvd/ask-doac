import Foundation

public struct Cluster: Sendable, Equatable {
    public var epIdx: Int
    public var paraStart: Int
    public var paraEnd: Int
    /// best hit's score in the cluster
    public var score: Float

    public init(epIdx: Int, paraStart: Int, paraEnd: Int, score: Float) {
        self.epIdx = epIdx
        self.paraStart = paraStart
        self.paraEnd = paraEnd
        self.score = score
    }
}

public struct ClusterOptions: Sendable {
    /// max number of distinct excerpts
    public var k: Int
    /// merge hits whose ranges come within this many paragraphs of each other
    public var gap: Int
    /// never grow a merged excerpt beyond this many paragraphs
    public var maxSpan: Int

    public init(k: Int, gap: Int, maxSpan: Int) {
        self.k = k
        self.gap = gap
        self.maxSpan = maxSpan
    }
}

/// Group hits into excerpts. When several hits land near each other in the
/// same episode, the conversation is going deep on the topic — merge them into
/// one longer excerpt instead of deduping the neighbors away. Hits must arrive
/// sorted best-first (what topK returns); clusters keep that order. After k
/// clusters exist, further hits can still widen existing clusters.
/// Mirrors clusterHits in src/lib/rag/retrieve.ts.
public func clusterHits(
    _ hits: [Scored],
    chunks: [(epIdx: Int, paraStart: Int, paraEnd: Int)],
    options: ClusterOptions
) -> [Cluster] {
    var kept: [Cluster] = []
    for hit in hits {
        let (epIdx, start, end) = chunks[hit.index]
        if let i = kept.firstIndex(where: {
            $0.epIdx == epIdx && start <= $0.paraEnd + options.gap && end >= $0.paraStart - options.gap
        }) {
            let paraStart = min(start, kept[i].paraStart)
            let paraEnd = max(end, kept[i].paraEnd)
            if paraEnd - paraStart + 1 <= options.maxSpan {
                kept[i].paraStart = paraStart
                kept[i].paraEnd = paraEnd
            }
            // else: drop the hit — that region is already richly represented
        } else if kept.count < options.k {
            kept.append(Cluster(epIdx: epIdx, paraStart: start, paraEnd: end, score: hit.score))
        }
    }
    return kept
}
