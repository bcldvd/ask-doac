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
                // fresh session per question: history lives in SwiftData, and the
                // 4k context is better spent on excerpts than on chat memory
                let session = LanguageModelSession(instructions: Prompt.system)
                let prompt = Prompt.grounded(question: question, sources: sources)
                do {
                    let stream = session.streamResponse(to: prompt)
                    for try await partial in stream {
                        continuation.yield(partial.content)
                    }
                    continuation.finish()
                } catch let error as LanguageModelSession.GenerationError {
                    if case .guardrailViolation = error {
                        continuation.finish(throwing: EngineError.guardrail)
                    } else {
                        continuation.finish(throwing: error)
                    }
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
