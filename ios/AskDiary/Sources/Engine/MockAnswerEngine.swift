import AskDiaryKit
import Foundation

/// Deterministic streaming engine for simulator UI work and UI tests
/// (launch argument -MockLLM). Retrieval still runs for real — only the
/// generation is canned, so citation chips resolve against real excerpts.
struct MockAnswerEngine: AnswerEngine {
    var isAvailable: Bool { true }
    var unavailableReason: String? { nil }

    func prewarm() {}

    func stream(question: String, sources: [RetrievedSource]) -> AsyncThrowingStream<String, Error> {
        let n = max(sources.count, 1)
        let answer = """
        The guests come back to this from a few angles. The core advice is to \
        protect the fundamentals first — sleep, focus, and honest feedback loops — \
        because "you can't out-hustle a broken system" [1]. Beyond that, they \
        suggest treating consistency as the real lever: small daily commitments \
        compound where bursts of intensity fade [\(min(2, n))]. One guest adds a \
        caveat the others don't cover: none of this works if you're optimizing \
        someone else's definition of success [\(min(3, n))].
        """
        return AsyncThrowingStream { continuation in
            let task = Task {
                var shown = ""
                for word in answer.split(separator: " ", omittingEmptySubsequences: false) {
                    shown += (shown.isEmpty ? "" : " ") + word
                    continuation.yield(shown)
                    try? await Task.sleep(for: .milliseconds(24))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
