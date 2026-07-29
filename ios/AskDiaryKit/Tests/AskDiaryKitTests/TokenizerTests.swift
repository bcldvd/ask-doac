import Foundation
import Testing

@testable import AskDiaryKit

/// Every case must produce byte-identical token ids to transformers.js
/// (fixtures from ios/scripts/gen-tokenizer-fixtures.mjs). tokenizer.json is
/// the vendored one under static/embedder (gitignored — vendor-embedder.mjs
/// recreates it), so these tests skip gracefully when it's absent.
@Suite struct TokenizerTests {
    static let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()

    static let tokenizerJSON = repoRoot.appendingPathComponent(
        "static/embedder/Xenova/all-MiniLM-L6-v2/tokenizer.json")
    static let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().appendingPathComponent("Fixtures/tokens.json")

    static func makeTokenizer() throws -> WordPieceTokenizer? {
        guard FileManager.default.fileExists(atPath: tokenizerJSON.path) else { return nil }
        return try WordPieceTokenizer(tokenizerJSON: Data(contentsOf: tokenizerJSON))
    }

    @Test func matchesTransformersJSOnAllFixtures() throws {
        guard let tokenizer = try Self.makeTokenizer() else { return }
        let cases = try JSONDecoder().decode(
            [String: [Int]].self, from: Data(contentsOf: Self.fixtures))
        #expect(cases.count >= 15)
        for (text, expected) in cases {
            let got = tokenizer.encode(text)
            #expect(got == expected, "mismatch for: \(text)")
        }
    }

    @Test func specialTokensAndBasics() throws {
        guard let tokenizer = try Self.makeTokenizer() else { return }
        #expect(tokenizer.clsId == 101)
        #expect(tokenizer.sepId == 102)
        #expect(tokenizer.unkId == 100)
        // empty input is just [CLS] [SEP]
        #expect(tokenizer.encode("") == [101, 102])
    }
}
