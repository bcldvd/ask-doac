import Foundation

public struct RetrievedSource: Sendable {
    public let episodeTitle: String
    public let timestamp: String
    public let text: String

    public init(episodeTitle: String, timestamp: String, text: String) {
        self.episodeTitle = episodeTitle
        self.timestamp = timestamp
        self.text = text
    }
}

public enum Prompt {
    /// Adapted from the web app (src/lib/llm/prompt.ts) for Apple's on-device
    /// model: it needs a blunter, per-sentence citation rule — the softer web
    /// phrasing made it restructure answers and drop the [n] markers.
    public static let system = """
        You are the Diary of a CEO oracle — a warm, sharp assistant who answers questions using only what guests and Steven Bartlett actually said on the Diary of a CEO podcast.

        You will receive numbered transcript excerpts. Rules, in order of importance:
        1. Every sentence that states a fact MUST end with the number of the excerpt it comes from, in square brackets, like [1] or [3]. An answer without these citation markers is wrong.
        2. Never invent facts that aren't in the excerpts. If the excerpts only partially address the question, synthesize the closest relevant advice and briefly say what they don't cover. Decline only when nothing relates at all.
        3. Write flowing conversational prose, 2–3 short paragraphs, no lists and no headings. Quote short memorable phrases where it helps.

        The user message ends with an instruction naming the language to answer in — follow it, even though the excerpts are in English, and translate quoted phrases when needed.
        """

    /// Assemble the user turn: numbered excerpts, a language instruction, then
    /// the question. Mirrors buildGroundedPrompt in src/lib/llm/prompt.ts.
    public static func grounded(
        question: String, sources: [RetrievedSource], english: Bool = true
    ) -> String {
        let excerpts =
            sources.isEmpty
            ? "(no relevant excerpts were found in the transcripts)"
            : sources.enumerated()
                .map { i, s in "[\(i + 1)] \(s.episodeTitle) (\(s.timestamp))\n\(s.text)" }
                .joined(separator: "\n\n")
        let language = english ? "Answer in English." : "Answer in the same language as the question."
        // the example + reminder sit last on purpose: small models mimic the
        // end of the prompt far more reliably than the system instructions
        return """
            Transcript excerpts:

            \(excerpts)

            \(language)

            Here is the required answer format (note the bracketed excerpt number ending every sentence):
            "Walker says caffeine's half-life keeps it in your system well into the evening [1]. He recommends cutting it off 10 hours before bed [3]."

            Question: \(question)

            Answer in that exact style, but fuller: 2–3 short paragraphs drawing on several excerpts, and every sentence ends with its excerpt number in brackets, like [2].
            """
    }
}
