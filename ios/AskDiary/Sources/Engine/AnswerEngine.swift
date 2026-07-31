import AskDiaryKit
import Foundation

/// Abstracts the LLM so the UI can run against a mock in the simulator and
/// Foundation Models on device. Streams cumulative answer snapshots.
protocol AnswerEngine: Sendable {
    var isAvailable: Bool { get }
    /// Human-readable reason when unavailable (device without Apple Intelligence, model still downloading…)
    var unavailableReason: String? { get }
    func prewarm()
    /// Yields the full answer-so-far on each update (cumulative, not deltas).
    func stream(question: String, sources: [RetrievedSource]) -> AsyncThrowingStream<String, Error>
}

enum EngineError: LocalizedError {
    case unavailable(String)
    case guardrail

    var errorDescription: String? {
        switch self {
        case .unavailable(let reason): return reason
        case .guardrail:
            return "Apple Intelligence declined this question. Try rephrasing it."
        }
    }
}
