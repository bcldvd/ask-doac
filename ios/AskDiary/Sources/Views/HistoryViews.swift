import SwiftData
import SwiftUI

/// Most recent answer summaries on the studio home.
struct HistoryList: View {
    let messages: [Message]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Earlier sessions")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .kerning(1.2)
                .foregroundStyle(Color("Brass"))
            ForEach(messages.prefix(10)) { message in
                NavigationLink {
                    MessageDetail(message: message)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(message.question)
                            .font(.system(.body, design: .serif))
                            .italic()
                            .foregroundStyle(Color("Paper"))
                            .lineLimit(2)
                        Text(message.createdAt, style: .date)
                            .font(.caption2)
                            .foregroundStyle(Color("Brass"))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                }
                .buttonStyle(.plain)
                .glassEffect(.regular, in: .rect(cornerRadius: 16))
            }
        }
    }
}

struct HistoryScreen: View {
    @Query(sort: \Message.createdAt, order: .reverse) private var messages: [Message]
    @Environment(\.modelContext) private var context

    var body: some View {
        ZStack {
            StudioBackground()
            List {
                ForEach(messages) { message in
                    NavigationLink {
                        MessageDetail(message: message)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(message.question).lineLimit(2)
                            Text(message.createdAt, format: .dateTime.day().month().hour().minute())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .listRowBackground(Color.clear)
                }
                .onDelete { offsets in
                    for i in offsets { context.delete(messages[i]) }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("History")
        .overlay {
            if messages.isEmpty {
                ContentUnavailableView(
                    "No sessions yet", systemImage: "clock",
                    description: Text("Answers you get are saved here and sync with iCloud."))
            }
        }
    }
}

/// A saved Q&A rendered like a live one.
struct MessageDetail: View {
    let message: Message
    @State private var openCitation: StoredCitation?

    var body: some View {
        ZStack {
            StudioBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(message.question)
                        .font(.system(.title2, design: .serif, weight: .medium))
                        .italic()
                        .foregroundStyle(Color("Paper"))
                    CitedText(text: message.answer, citations: message.citations) {
                        openCitation = $0
                    }
                    if !message.citations.isEmpty {
                        SourcesRow(citations: message.citations) { openCitation = $0 }
                    }
                }
                .padding(20)
            }
        }
        .sheet(item: $openCitation) { citation in
            SourceDetail(citation: citation)
                .presentationDetents([.medium, .large])
                .presentationBackground(.thinMaterial)
        }
    }
}
