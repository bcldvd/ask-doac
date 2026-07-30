import AskDiaryKit
import CoreML
import Foundation

/// Query embedding: WordPiece tokenize, pad to the model's fixed 128-token
/// shape, run the bundled Core ML MiniLM. Same 384-dim space as the index.
struct Embedder: Sendable {
    static let maxSeq = 128
    private let model: MLModel
    private let tokenizer: WordPieceTokenizer

    init(modelURL: URL, tokenizerJSON: Data) throws {
        let config = MLModelConfiguration()
        config.computeUnits = .all
        model = try MLModel(contentsOf: modelURL, configuration: config)
        tokenizer = try WordPieceTokenizer(tokenizerJSON: tokenizerJSON)
    }

    func embed(_ text: String) throws -> [Float] {
        var ids = tokenizer.encode(text)
        if ids.count > Self.maxSeq {
            // keep [SEP] as the final token when truncating
            ids = Array(ids.prefix(Self.maxSeq - 1)) + [tokenizer.sepId]
        }
        let mask = [Int32](repeating: 1, count: ids.count)
            + [Int32](repeating: 0, count: Self.maxSeq - ids.count)
        let padded = ids.map(Int32.init) + [Int32](repeating: 0, count: Self.maxSeq - ids.count)

        let shape: [NSNumber] = [1, NSNumber(value: Self.maxSeq)]
        let inputIds = try MLMultiArray(shape: shape, dataType: .int32)
        let attentionMask = try MLMultiArray(shape: shape, dataType: .int32)
        for i in 0..<Self.maxSeq {
            inputIds[i] = NSNumber(value: padded[i])
            attentionMask[i] = NSNumber(value: mask.indices.contains(i) ? mask[i] : 0)
        }

        let out = try model.prediction(
            from: MLDictionaryFeatureProvider(dictionary: [
                "input_ids": MLFeatureValue(multiArray: inputIds),
                "attention_mask": MLFeatureValue(multiArray: attentionMask),
            ]))
        guard let emb = out.featureValue(for: "embedding")?.multiArrayValue else {
            throw EmbedderError.badOutput
        }
        return (0..<emb.count).map { Float(truncating: emb[$0]) }
    }

    enum EmbedderError: Error { case badOutput }
}
