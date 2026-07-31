import Testing

@testable import AskDiaryKit

@Suite struct AnswerHygieneTests {
    @Test func healthyAnswerIsNotDegenerate() {
        let text = """
            Sleep is the foundation of health [1]. Caffeine has a six-hour half-life, \
            so an afternoon coffee still blocks adenosine at midnight [2]. The guests \
            agree that consistency beats intensity for long-term change [3].
            """
        #expect(!AnswerHygiene.looksDegenerate(text))
    }

    @Test func repetitionLoopIsDegenerate() {
        // distilled from a real looping answer (house-vs-stocks, 2026-07-31)
        let loop = """
            Steven Bartlett asks the Money Expert if he would invest in a house because of the PERMA framework. \
            The Money Expert says that he would invest in a house because of the PERMA framework [3]. \
            Steven Bartlett asks the Money Expert if he would invest in a house because of the PERMA framework and not taking enough risk. \
            The Money Expert says that he would invest in a house because of the PERMA framework [3]. \
            The Money Expert says that he would invest in a house because of the PERMA framework and not taking enough risk and buying a house [3].
            """
        #expect(AnswerHygiene.looksDegenerate(loop))
    }

    @Test func shortRepeatedPhrasesDoNotTrip() {
        let text = "Yes [1]. Yes [2]. Yes [3]. Each guest agreed in their own words."
        #expect(!AnswerHygiene.looksDegenerate(text))
    }

    @Test func cleanEndingIsUntouched() {
        let text = "The answer ends properly [2]."
        #expect(AnswerHygiene.trimmedTail(text) == text)
    }

    @Test func truncatedTailIsDropped() {
        let text = "First point stands complete and is long enough to keep around [1]. Steven Bartlett asks the"
        #expect(AnswerHygiene.trimmedTail(text) == "First point stands complete and is long enough to keep around [1].")
    }

    @Test func shortAnswerIsNotGutted() {
        let text = "Too short to trim safely"
        #expect(AnswerHygiene.trimmedTail(text) == text)
    }
}
