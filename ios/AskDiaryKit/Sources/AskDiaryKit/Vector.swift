import Foundation

/// Mirrors src/lib/rag/vector.ts — same math, same quantization scheme, so the
/// bundled index built by the web pipeline ranks identically here.
public enum Vector {
    /// Scale a vector to unit length (zero vectors are returned as-is).
    public static func normalize(_ v: [Float]) -> [Float] {
        var sum: Float = 0
        for x in v { sum += x * x }
        guard sum > 0 else { return v }
        let inv = 1 / sum.squareRoot()
        return v.map { $0 * inv }
    }

    /// Symmetric int8 quantization: q[i]/127 * scale ≈ v[i], scale = max |v[i]|.
    public static func quantize(_ v: [Float]) -> (q: [Int8], scale: Float) {
        var scale: Float = 0
        for x in v { scale = max(scale, abs(x)) }
        guard scale > 0 else { return (q: [Int8](repeating: 0, count: v.count), scale: 0) }
        let q = v.map { Int8(($0 / scale * 127).rounded()) }
        return (q: q, scale: scale)
    }
}

public struct Scored: Sendable, Equatable {
    public let index: Int
    public let score: Float

    public init(index: Int, score: Float) {
        self.index = index
        self.score = score
    }
}

extension Vector {
    /// Cosine top-k of a unit-length float query against a flat int8 corpus
    /// (one scale per row). Returns the k best rows, highest score first.
    public static func topK(
        query: [Float], corpus: [Int8], scales: [Float], dims: Int, k: Int
    ) -> [Scored] {
        let rows = corpus.count / dims
        var scored = [Scored]()
        scored.reserveCapacity(rows)
        query.withUnsafeBufferPointer { q in
            corpus.withUnsafeBufferPointer { c in
                for r in 0..<rows {
                    var dot: Float = 0
                    let off = r * dims
                    for d in 0..<dims {
                        dot += q[d] * Float(c[off + d])
                    }
                    scored.append(Scored(index: r, score: dot * scales[r] / 127))
                }
            }
        }
        scored.sort { $0.score > $1.score }
        return Array(scored.prefix(min(k, rows)))
    }
}
