import Testing

@testable import AskDiaryKit

@Suite struct PromptTests {
    let sources = [
        RetrievedSource(episodeTitle: "Sleep Expert", timestamp: "01:02:03", text: "Caffeine blocks adenosine."),
        RetrievedSource(episodeTitle: "Money Talk", timestamp: "05:42", text: "Pay yourself first."),
    ]

    @Test func numbersExcerptsAndEndsWithQuestion() {
        let p = Prompt.grounded(question: "How does caffeine work?", sources: sources)
        #expect(p.contains("[1] Sleep Expert (01:02:03)\nCaffeine blocks adenosine."))
        #expect(p.contains("[2] Money Talk (05:42)\nPay yourself first."))
        #expect(p.hasSuffix("Question: How does caffeine work?"))
        #expect(p.contains("Answer in English."))
    }

    @Test func emptySourcesGetPlaceholder() {
        let p = Prompt.grounded(question: "Anything?", sources: [])
        #expect(p.contains("(no relevant excerpts were found in the transcripts)"))
    }

    @Test func nonEnglishAsksForQuestionLanguage() {
        let p = Prompt.grounded(question: "Comment ça marche ?", sources: sources, english: false)
        #expect(p.contains("Answer in the same language as the question."))
    }
}

@Suite struct YouTubeTests {
    // Ports src/lib/rag/youtube.test.ts
    @Test func parsesHHMMSS() {
        #expect(YouTube.timestampToSeconds("01:15:08") == 4508)
    }

    @Test func parsesMMSS() {
        #expect(YouTube.timestampToSeconds("05:42") == 342)
    }

    @Test func garbageIsZero() {
        #expect(YouTube.timestampToSeconds("") == 0)
        #expect(YouTube.timestampToSeconds("abc") == 0)
        #expect(YouTube.timestampToSeconds("1:2:3:4") == 0)
    }

    @Test func buildsDeepLink() {
        #expect(
            YouTube.url(videoId: "abc123", timestamp: "01:00").absoluteString
                == "https://www.youtube.com/watch?v=abc123&t=60s")
    }

    @Test func omitsZeroTimestamp() {
        #expect(
            YouTube.url(videoId: "abc123", timestamp: "00:00").absoluteString
                == "https://www.youtube.com/watch?v=abc123")
    }
}
