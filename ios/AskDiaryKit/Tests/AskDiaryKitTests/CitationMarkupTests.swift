import Testing

@testable import AskDiaryKit

@Suite struct CitationMarkupTests {
    let ids: Set<Int> = [1, 2, 3, 4, 5, 6]

    @Test func bracketSingle() {
        let segs = CitationMarkup.segments(of: "Sleep matters [1]. A lot.", validIDs: ids)
        #expect(segs == [.prose("Sleep matters "), .citation(1), .prose(". A lot.")])
    }

    @Test func parenSingle() {
        let segs = CitationMarkup.segments(of: "He prefers an engine (1).", validIDs: ids)
        #expect(segs == [.prose("He prefers an engine "), .citation(1), .prose(".")])
    }

    @Test func groupedParens() {
        let segs = CitationMarkup.segments(of: "Buy on affordability (2, 3).", validIDs: ids)
        #expect(segs == [.prose("Buy on affordability "), .citation(2), .citation(3), .prose(".")])
    }

    @Test func groupedBrackets() {
        let segs = CitationMarkup.segments(of: "Both said it [2, 3].", validIDs: ids)
        #expect(segs == [.prose("Both said it "), .citation(2), .citation(3), .prose(".")])
    }

    @Test func invalidNumberStaysProse() {
        let segs = CitationMarkup.segments(of: "It grew (30) percent.", validIDs: ids)
        #expect(segs == [.prose("It grew (30) percent.")])
    }

    @Test func mixedValidAndInvalidGroupStaysProse() {
        let segs = CitationMarkup.segments(of: "See (2, 99).", validIDs: ids)
        #expect(segs == [.prose("See (2, 99).")])
    }

    @Test func noMarkers() {
        let segs = CitationMarkup.segments(of: "Plain answer.", validIDs: ids)
        #expect(segs == [.prose("Plain answer.")])
    }

    @Test func emptyValidIDsChipsNothing() {
        let segs = CitationMarkup.segments(of: "Claims [1] here.", validIDs: [])
        #expect(segs == [.prose("Claims [1] here.")])
    }
}
