import Testing

@testable import AskDiaryKit

@Suite struct CapTests {
    func chunk(_ text: String) -> RetrievedChunk {
        RetrievedChunk(
            episodeTitle: "Ep", episodeURL: "u", videoURL: nil, timestamp: "01:00",
            text: text, score: 0.5)
    }

    @Test func shortExcerptsPassThrough() {
        let c = chunk("hello\nworld")
        #expect(c.capped(at: 100).text == "hello\nworld")
    }

    @Test func cutsOnParagraphBoundary() {
        let text = ["a".repeated(50), "b".repeated(50), "c".repeated(50)].joined(separator: "\n")
        let capped = chunk(text).capped(at: 120)
        #expect(capped.text.hasSuffix("…"))
        #expect(capped.text.contains("b"))
        #expect(!capped.text.contains("c"))
    }

    @Test func hardCutsSingleLongParagraph() {
        let capped = chunk("x".repeated(500)).capped(at: 100)
        #expect(capped.text.count <= 103)
        #expect(capped.text.hasSuffix("…"))
    }
}

extension String {
    fileprivate func repeated(_ n: Int) -> String { String(repeating: self, count: n) }
}
