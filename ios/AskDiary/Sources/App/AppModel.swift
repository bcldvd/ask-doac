import AskDiaryKit
import Foundation
import Observation
import os

/// One in-flight or finished answer, streamed into the UI.
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
        do {
            let chunks = try await rag.retrieve(question: question)
            session.citations = chunks.enumerated().map { i, c in
                StoredCitation(
                    id: i + 1, episodeTitle: cleanTitle(c.episodeTitle), episodeURL: c.episodeURL,
                    videoURL: c.videoURL?.absoluteString, timestamp: c.timestamp, text: c.text)
            }
            session.phase = .generating
            for try await snapshot in engine.stream(question: question, sources: chunks.map(\.source)) {
                session.answerText = snapshot
            }
            session.phase = .done
        } catch {
            session.error = error.localizedDescription
            session.phase = .failed
        }
        return session
    }

    /// Episode titles in the index read "Transcript of X" — strip the scaffolding.
    private func cleanTitle(_ title: String) -> String {
        title.hasPrefix("Transcript of ") ? String(title.dropFirst("Transcript of ".count)) : title
    }
}
