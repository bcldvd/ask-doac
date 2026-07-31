import AskDiaryKit
import SwiftUI

/// A streaming (or finished) answer, styled like the web feed: mono turn
/// label, Anton uppercase question, the answer on a volt left border.
struct AnswerView: View {
    let session: AnswerSession
    @State private var openCitation: StoredCitation?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                CapsLabel(text: "You asked")
                Text(session.question)
                    .font(DS.display(28, relativeTo: .title))
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                    .lineSpacing(2)
            }
            .padding(.top, 12)

            VStack(alignment: .leading, spacing: 16) {
                switch session.phase {
                case .retrieving:
                    HStack(spacing: 10) {
                        ProgressView().tint(DS.muted)
                        CapsLabel(text: "Searching 228 episodes…", color: DS.muted)
                    }
                case .generating, .done:
                    CitedText(text: session.answerText, citations: session.citations) { citation in
                        openCitation = citation
                    }
                    if !session.citations.isEmpty {
                        SourcesList(citations: session.citations) { openCitation = $0 }
                    }
                case .failed:
                    ErrorCard(message: session.error ?? "Something went wrong.")
                    // the excerpts are still the receipts — show them even when
                    // generation is declined
                    if !session.citations.isEmpty {
                        CapsLabel(text: "Closest moments from the diary")
                        SourcesList(citations: session.citations) { openCitation = $0 }
                    }
                }
            }
            .padding(.leading, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) { DS.volt.frame(width: 2) }
        }
        .sheet(item: $openCitation) { citation in
            SourceDetail(citation: citation)
                .presentationDetents([.medium, .large])
                .presentationBackground(.black)
        }
    }
}

/// The web's error-card: black, red hairline, red display title.
struct ErrorCard: View {
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NO ANSWER")
                .font(DS.display(15, relativeTo: .headline))
                .foregroundStyle(DS.red)
            Text(message)
                .font(DS.body(15, .light))
                .foregroundStyle(DS.muted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black, in: .rect(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(DS.red, lineWidth: 1))
    }
}

/// Renders answer text with citation markers as tappable volt mono numbers.
struct CitedText: View {
    let text: String
    let citations: [StoredCitation]
    let onTap: (StoredCitation) -> Void

    var body: some View {
        Text(attributed)
            .font(DS.body(16))
            .lineSpacing(5)
            .foregroundStyle(.white)
            .environment(\.openURL, OpenURLAction { url in
                if url.scheme == "citation", let n = Int(url.host() ?? ""),
                    let citation = citations.first(where: { $0.id == n }) {
                    onTap(citation)
                    return .handled
                }
                return .systemAction
            })
    }

    private var attributed: AttributedString {
        var out = AttributedString()
        let valid = Set(citations.map(\.id))
        for segment in CitationMarkup.segments(of: text, validIDs: valid) {
            switch segment {
            case .prose(let p):
                out += AttributedString(p)
            case .citation(let n):
                var chip = AttributedString("\(n)")
                chip.link = URL(string: "citation://\(n)")
                chip.font = .custom("SplineSansMono-Regular", size: 12, relativeTo: .footnote)
                chip.foregroundColor = Color("Volt")
                out += AttributedString(" ") + chip
            }
        }
        return out
    }
}

/// Vertical source rows, like the web: [n] volt, title muted, ▶ timestamp volt.
struct SourcesList: View {
    let citations: [StoredCitation]
    let onTap: (StoredCitation) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(citations) { citation in
                Button {
                    onTap(citation)
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("[\(citation.id)]")
                            .font(DS.mono(11))
                            .foregroundStyle(DS.volt)
                        Text(citation.episodeTitle)
                            .font(DS.body(14, .light))
                            .foregroundStyle(DS.muted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        Text("▶ \(citation.timestamp)")
                            .font(DS.mono(11))
                            .foregroundStyle(DS.volt)
                            .layoutPriority(1)
                    }
                    .padding(.vertical, 6)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 6)
    }
}

/// Full excerpt with the YouTube deep link.
struct SourceDetail: View {
    let citation: StoredCitation
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                CapsLabel(text: "From the transcript · \(citation.timestamp)")
                Text(citation.episodeTitle)
                    .font(DS.display(20, relativeTo: .title3))
                    .textCase(.uppercase)
                    .foregroundStyle(.white)
                Text(citation.text)
                    .font(DS.body(15, .light))
                    .lineSpacing(5)
                    .foregroundStyle(DS.muted)
                if let video = citation.videoURL, let url = URL(string: video) {
                    Button {
                        openURL(url)
                    } label: {
                        Text("WATCH AT \(citation.timestamp)")
                            .font(DS.display(15, relativeTo: .callout))
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(DS.volt, in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 8)
                }
            }
            .padding(22)
        }
        .background(Color.black)
    }
}
