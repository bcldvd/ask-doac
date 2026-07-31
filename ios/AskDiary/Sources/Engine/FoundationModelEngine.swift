import AskDiaryKit
import Foundation
import FoundationModels

/// Apple Foundation Models: the on-device ~3B model behind Apple Intelligence.
/// No download, no server — the reason this app can answer instantly on first
/// launch where the web app needed a 2 GB model fetch.
struct FoundationModelEngine: AnswerEngine {
    var isAvailable: Bool {
        SystemLanguageModel.default.availability == .available
    }

    var unavailableReason: String? {
        switch SystemLanguageModel.default.availability {
        case .available:
            return nil
        case .unavailable(.deviceNotEligible):
            return "This iPhone doesn't support Apple Intelligence, which Ask the Diary uses to answer on-device."
        case .unavailable(.appleIntelligenceNotEnabled):
            return "Turn on Apple Intelligence in Settings to ask questions — everything runs on your iPhone."
        case .unavailable(.modelNotReady):
            return "Apple Intelligence is still downloading its model. Try again in a few minutes."
        case .unavailable:
            return "Apple Intelligence isn't available right now."
        }
    }

    func prewarm() {
        guard isAvailable else { return }
        LanguageModelSession(instructions: Prompt.system).prewarm()
    }

    func stream(question: String, sources: [RetrievedSource]) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                guard isAvailable else {
                    continuation.finish(
                        throwing: EngineError.unavailable(unavailableReason ?? "Model unavailable"))
                    return
                }
                let prompt = Prompt.grounded(question: question, sources: sources)
                do {
                    var answer = try await generate(prompt: prompt, into: continuation)
                    // the 3B model occasionally collapses into a repetition
                    // loop (~1/12 at temp 0.7) — one fresh-session retry
                    if AnswerHygiene.looksDegenerate(answer) {
                        answer = try await generate(prompt: prompt, into: continuation)
                    }
                    let trimmed = AnswerHygiene.trimmedTail(answer)
                    if trimmed != answer { continuation.yield(trimmed) }
                    continuation.finish()
                } catch let error where isGuardrail(error) {
                    // guardrails are stochastic and the transcripts discuss
                    // health frankly — one silent retry rescues most of them
                    do {
                        let answer = try await generate(prompt: prompt, into: continuation)
                        let trimmed = AnswerHygiene.trimmedTail(answer)
                        if trimmed != answer { continuation.yield(trimmed) }
                        continuation.finish()
                    } catch {
                        continuation.finish(throwing: EngineError.guardrail)
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// One generation attempt on a fresh session (history lives in SwiftData;
    /// the 4k context is better spent on excerpts than chat memory).
    /// Returns the final answer so callers can run post-generation hygiene.
    @discardableResult
    private func generate(
        prompt: String, into continuation: AsyncThrowingStream<String, Error>.Continuation
    ) async throws -> String {
        let session = LanguageModelSession(instructions: Prompt.system)
        // moderate temperature (0.3 made the 3B model loop on one sentence);
        // the token cap bounds runaway repetition
        // plain text streaming on purpose: guided generation (with or without
        // schema-in-prompt) consistently tripped the safety guardrails on this
        // health-frank transcript content, while plain text sails through.
        // citations come from the prompt rules; sources always render as cards.
        let stream = session.streamResponse(
            to: prompt,
            options: GenerationOptions(temperature: 0.7, maximumResponseTokens: 400))
        var latest = ""
        for try await partial in stream {
            latest = partial.content
            continuation.yield(latest)
        }
        return latest
    }

    private func isGuardrail(_ error: Error) -> Bool {
        if let e = error as? LanguageModelSession.GenerationError {
            if case .guardrailViolation = e { return true }
            if case .refusal = e { return true }
        }
        return false
    }
}
