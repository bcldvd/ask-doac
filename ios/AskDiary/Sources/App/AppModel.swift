import AskDiaryKit
import Foundation
import Observation
import os

/// One in-flight or finished answer, streamed into the UI.
@MainActor
@Observable
final class AnswerSession: Identifiable {
    let id = UUID()
    let question: String
    var answerText: String = ""
    var citations: [StoredCitation] = []
    var phase: Phase = .retrieving
    var error: String?

    enum Phase { case retrieving, generating, done, failed }

    init(question: String) {
        self.question = question
    }
}

@MainActor
@Observable
final class AppModel {
    static let log = Logger(subsystem: "com.davidbocle.askdiary", category: "app")

    let rag = RagService()
    let engine: any AnswerEngine
    var current: AnswerSession?
    var indexReady = false

    /// ON AIR = engine available and index loaded; the studio light is on.
    var onAir: Bool { indexReady && engine.isAvailable }
    var isStreaming: Bool { current?.phase == .generating || current?.phase == .retrieving }

    init() {
        if ProcessInfo.processInfo.arguments.contains("-MockLLM") {
            engine = MockAnswerEngine()
        } else {
            engine = FoundationModelEngine()
        }
    }

    func warmUp() async {
        engine.prewarm()
        do {
            try await rag.warmUp()
            indexReady = true
        } catch {
            Self.log.error("index load failed: \(error)")
        }
    }

    @discardableResult
    func ask(_ question: String) async -> AnswerSession {
        let session = AnswerSession(question: question)
        current = session
        let clock = ContinuousClock()
        let start = clock.now
        var retrievalDone = start
        var firstToken: ContinuousClock.Instant?
        do {
            let chunks = try await rag.retrieve(question: question)
            retrievalDone = clock.now
            session.citations = chunks.enumerated().map { i, c in
                StoredCitation(
                    id: i + 1, episodeTitle: cleanTitle(c.episodeTitle), episodeURL: c.episodeURL,
                    videoURL: c.videoURL?.absoluteString, timestamp: c.timestamp, text: c.text)
            }
            session.phase = .generating
            for try await snapshot in engine.stream(question: question, sources: chunks.map(\.source)) {
                if firstToken == nil { firstToken = clock.now }
                session.answerText = snapshot
            }
            session.phase = .done
        } catch {
            session.error = error.localizedDescription
            session.phase = .failed
        }
        func secs(_ to: ContinuousClock.Instant) -> Double {
            let d = start.duration(to: to).components
            return Double(d.seconds) + Double(d.attoseconds) / 1e18
        }
        let timing = String(
            format: "retrieval %.2fs, first token %.2fs, total %.2fs",
            secs(retrievalDone), firstToken.map(secs) ?? -1, secs(clock.now))
        logForQA(session, timing: timing)
        return session
    }

    /// Under -AutoAsk, dump the outcome so the scripted QA loop can read it
    /// back (public: scripted QA only, never user data). print() mirrors the
    /// os_log lines because `devicectl --console` only captures stdout.
    private func logForQA(_ session: AnswerSession, timing: String) {
        guard ProcessInfo.processInfo.arguments.contains("-AutoAsk") else { return }
        func emit(_ line: String) {
            Self.log.info("\(line, privacy: .public)")
            print(line)
        }
        switch session.phase {
        case .done:
            emit("QA timing | \(timing)")
            emit("QA answer | \(session.question) | \(session.answerText)")
            for c in session.citations {
                emit("QA source [\(c.id)] \(c.timestamp) | \(c.episodeTitle)")
            }
        case .failed:
            emit("QA failed | \(session.question) | \(session.error ?? "?")")
        default: break
        }
    }

    /// Episode titles in the index read "Transcript of X" — strip the scaffolding.
    private func cleanTitle(_ title: String) -> String {
        title.hasPrefix("Transcript of ") ? String(title.dropFirst("Transcript of ".count)) : title
    }
}
