import SwiftUI

/// A streaming (or finished) answer: the question set like a diary entry,
/// the answer with [n] rendered as tappable tape-marker chips, then sources.
struct AnswerView: View {
    let session: AnswerSession
    @State private var openCitation: StoredCitation?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(session.question)
                .font(.system(.title2, design: .serif, weight: .medium))
                .italic()
                .foregroundStyle(Color("Paper"))

            switch session.phase {
            case .retrieving:
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Searching 228 episodes…")
                        .font(.callout)
                        .foregroundStyle(Color("Brass"))
                }
            case .generating, .done:
                CitedText(text: session.answerText, citations: session.citations) { citation in
                    openCitation = citation
                }
                if !session.citations.isEmpty {
                    SourcesRow(citations: session.citations) { openCitation = $0 }
                }
            case .failed:
                ContentUnavailableView {
                    Label("No answer", systemImage: "mic.slash")
                } description: {
                    Text(session.error ?? "Something went wrong.")
                }
            }
        }
        .sheet(item: $openCitation) { citation in
            SourceDetail(citation: citation)
                .presentationDetents([.medium, .large])
                .presentationBackground(.thinMaterial)
        }
    }
}

/// Renders answer text with [n] markers as inline signal-red chips.
struct CitedText: View {
    let text: String
    let citations: [StoredCitation]
    let onTap: (StoredCitation) -> Void

    var body: some View {
        Text(attributed)
            .font(.body)
            .lineSpacing(4)
            .foregroundStyle(Color("Paper"))
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
        var rest = Substring(text)
        while let range = rest.range(of: #"\[(\d+)\]"#, options: .regularExpression) {
            out += AttributedString(rest[..<range.lowerBound])
            let n = Int(rest[range].dropFirst().dropLast()) ?? 0
            var chip = AttributedString("\(n)")
            chip.link = URL(string: "citation://\(n)")
            chip.font = .system(size: 12, weight: .bold, design: .monospaced)
            chip.foregroundColor = Color("SignalRed")
            chip.backgroundColor = Color("SignalRed").opacity(0.14)
            out += AttributedString(" ") + chip
            rest = rest[range.upperBound...]
        }
        out += AttributedString(rest)
        return out
    }
}

/// Horizontally scrolling glass cards, one per excerpt.
struct SourcesRow: View {
    let citations: [StoredCitation]
    let onTap: (StoredCitation) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(citations) { citation in
                    Button {
                        onTap(citation)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("[\(citation.id)] \(citation.timestamp)")
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .foregroundStyle(Color("SignalRed"))
                            Text(citation.episodeTitle)
                                .font(.footnote.weight(.medium))
                                .foregroundStyle(Color("Paper"))
                                .lineLimit(2, reservesSpace: true)
                                .multilineTextAlignment(.leading)
                        }
                        .padding(12)
                        .frame(width: 200, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular, in: .rect(cornerRadius: 16))
                }
            }
            .padding(.vertical, 2)
        }
        .scrollClipDisabled()
    }
}

/// Full excerpt with the YouTube deep link.
struct SourceDetail: View {
    let citation: StoredCitation
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(citation.episodeTitle)
                    .font(.system(.title3, design: .serif, weight: .semibold))
                Text(citation.timestamp)
                    .font(.system(.callout, design: .monospaced))
                    .foregroundStyle(Color("SignalRed"))
                Text(citation.text)
                    .font(.callout)
                    .lineSpacing(4)
                if let video = citation.videoURL, let url = URL(string: video) {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Watch at \(citation.timestamp)", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.glassProminent)
                    .tint(Color("SignalRed"))
                }
            }
            .padding(20)
        }
    }
}
