import Testing

@testable import AskDiaryKit

// Ports src/lib/rag/vector.test.ts one-for-one.

@Suite struct NormalizeTests {
    @Test func scalesToUnitLength() {
        let n = Vector.normalize([3, 4])
        #expect(abs(n[0] - 0.6) < 1e-5)
        #expect(abs(n[1] - 0.8) < 1e-5)
    }

    @Test func leavesZeroVectorUntouched() {
        #expect(Vector.normalize([0, 0]) == [0, 0])
    }
}

@Suite struct QuantizeTests {
    @Test func roundTripsWithinInt8Tolerance() {
        let v = Vector.normalize([0.5, -0.25, 0.1, -1])
        let (q, scale) = Vector.quantize(v)
        for i in v.indices {
            #expect(abs(Float(q[i]) * scale / 127 - v[i]) < 0.05)
        }
    }

    @Test func usesMaxAbsoluteValueAsScale() {
        let (q, scale) = Vector.quantize([0.2, -0.8])
        #expect(abs(scale - 0.8) < 1e-5)
        #expect(q[1] == -127)
    }
}

@Suite struct TopKTests {
    // 4 corpus vectors in 3 dims, quantized into one flat int8 array
    static let corpus: [[Float]] = [[1, 0, 0], [0, 1, 0], [0.9, 0.1, 0], [-1, 0, 0]]
        .map(Vector.normalize)
    let dims = 3
    var flat: [Int8] = []
    var scales: [Float] = []

    init() {
        for v in Self.corpus {
            let (q, scale) = Vector.quantize(v)
            flat.append(contentsOf: q)
            scales.append(scale)
        }
    }

    @Test func returnsKMostSimilarBestFirst() {
        let res = Vector.topK(
            query: Vector.normalize([1, 0.05, 0]), corpus: flat, scales: scales, dims: dims, k: 2)
        #expect(res.map(\.index) == [0, 2])
        #expect(res[0].score > res[1].score)
    }

    @Test func oppositeVectorRanksLast() {
        let res = Vector.topK(
            query: Vector.normalize([1, 0, 0]), corpus: flat, scales: scales, dims: dims, k: 4)
        #expect(res.last?.index == 3)
        #expect(res.last!.score < 0)
    }

    @Test func clampsKToCorpusSize() {
        let res = Vector.topK(
            query: Vector.normalize([0, 1, 0]), corpus: flat, scales: scales, dims: dims, k: 99)
        #expect(res.count == 4)
    }
}
