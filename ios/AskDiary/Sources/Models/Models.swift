import Foundation
import SwiftData

// CloudKit-compatible models: every property optional or defaulted, no unique
// constraints, relationships optional.

@Model
final class Conversation {
    var createdAt: Date = Date.now
    var title: String = ""
    @Relationship(deleteRule: .cascade, inverse: \Message.conversation)
    var messages: [Message]? = []

    init(title: String = "") {
        self.title = title
    }
}

@Model
final class Message {
    var createdAt: Date = Date.now
    var question: String = ""
    var answer: String = ""
    /// JSON-encoded [StoredCitation] — SwiftData+CloudKit friendly
    var citationsData: Data = Data()
    var conversation: Conversation?

    init(question: String) {
        self.question = question
    }

    var citations: [StoredCitation] {
        get { (try? JSONDecoder().decode([StoredCitation].self, from: citationsData)) ?? [] }
        set { citationsData = (try? JSONEncoder().encode(newValue)) ?? Data() }
    }
}

/// A resolved citation, denormalized so history renders without re-retrieval.
struct StoredCitation: Codable, Hashable, Identifiable {
    var id: Int  // the [n] number
    var episodeTitle: String
    var episodeURL: String
    var videoURL: String?
    var timestamp: String
    var text: String
}
