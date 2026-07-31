import SwiftData
import SwiftUI

/// Most recent answer summaries on the studio home, as web-style cards.
struct HistoryList: View {
    let messages: [Message]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CapsLabel(text: "Earlier sessions")
                .padding(.top, 12)
            ForEach(messages.prefix(10)) { message in
                NavigationLink {
                    MessageDetail(message: message)
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(message.question)
                            .font(DS.body(16, .medium))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text(message.createdAt, style: .date)
                            .font(DS.mono(10))
                            .foregroundStyle(DS.faint)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .background(.black, in: .rect(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(DS.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct HistoryScreen: View {
    @Query(sort: \Message.createdAt, order: .reverse) private var messages: [Message]
    @Environment(\.modelContext) private var context

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            List {
                ForEach(messages) { message in
                    NavigationLink {
                        MessageDetail(message: message)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(message.question)
                                .font(DS.body(16, .medium))
                                .foregroundStyle(.white)
                                .lineLimit(2)
                            Text(message.createdAt, format: .dateTime.day().month().hour().minute())
                                .font(DS.mono(10))
                                .foregroundStyle(DS.faint)
                        }
                    }
                    .listRowBackground(Color.black)
                    .listRowSeparatorTint(DS.line)
                }
                .onDelete { offsets in
                    for i in offsets { context.delete(messages[i]) }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("History")
        .toolbarBackground(.black, for: .navigationBar)
        .overlay {
            if messages.isEmpty {
                ContentUnavailableView(
                    "No sessions yet", systemImage: "clock",
                    description: Text("Answers you get are saved here and sync with iCloud."))
            }
        }
    }
}

/// A saved Q&A rendered like a live one: mono label, Anton question,
/// answer on the volt border.
struct MessageDetail: View {
    let message: Message
    @State private var openCitation: StoredCitation?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        CapsLabel(text: "You asked")
                        Text(message.question)
                            .font(DS.display(28, relativeTo: .title))
                            .textCase(.uppercase)
                            .foregroundStyle(.white)
                            .lineSpacing(2)
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        CitedText(text: message.answer, citations: message.citations) {
                            openCitation = $0
                        }
                        if !message.citations.isEmpty {
                            SourcesList(citations: message.citations) { openCitation = $0 }
                        }
                    }
                    .padding(.leading, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) { DS.volt.frame(width: 2) }
                }
                .padding(20)
            }
        }
        .toolbarBackground(.black, for: .navigationBar)
        .sheet(item: $openCitation) { citation in
            SourceDetail(citation: citation)
                .presentationDetents([.medium, .large])
                .presentationBackground(.black)
        }
    }
}
