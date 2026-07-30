import SwiftUI

/// Onboarding modeled on Slate - Private Journal (user-provided reference):
/// pure dark pages, a thin progress bar, one bold plain-spoken headline,
/// an icon-row card, muted proof copy, a single white pill button.
struct OnboardingView: View {
    let done: () -> Void
    @State private var page = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ProgressBar(progress: Double(page + 1) / 3)
                .padding(.top, 24)
                .padding(.bottom, 40)

            Group {
                switch page {
                case 0: whatItIs
                case 1: privacy
                default: ready
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))

            Button {
                if page < 2 {
                    withAnimation(.snappy) { page += 1 }
                } else {
                    done()
                }
            } label: {
                Text(page < 2 ? "Continue" : "Start asking")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .tint(.white)
            .foregroundStyle(.black)
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 24)
        .background(Color.black.ignoresSafeArea())
    }

    // MARK: page 1 — what it is

    private var whatItIs: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("400 hours of Diary of a CEO.\nAnswered in seconds.")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.white)
            InfoCard(rows: [
                .init(icon: "text.quote", title: "Ask anything",
                      detail: "Sleep, money, hiring, heartbreak — whatever the guests covered."),
                .init(icon: "waveform", title: "228 episodes inside",
                      detail: "Full transcripts ship with the app. Nothing to download."),
                .init(icon: "timer", title: "Cited to the minute",
                      detail: "Every claim links to the exact moment it was said, on YouTube."),
            ])
            Text("Answers come only from what guests and Steven actually said — with the receipts attached.")
                .font(.callout)
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    // MARK: page 2 — privacy, the Slate page

    private var privacy: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("We cannot see your questions.\nNot won't, can't.")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.white)
            InfoCard(rows: [
                .init(icon: "magnifyingglass", title: "Your question",
                      detail: "Understood and searched on this phone."),
                .init(icon: "books.vertical", title: "The transcripts",
                      detail: "Stored inside the app. Nothing is fetched."),
                .init(icon: "brain", title: "The answer",
                      detail: "Apple's on-device model. It never phones home."),
                .init(icon: "icloud", title: "iCloud sync, optional",
                      detail: "Your history syncs encrypted to your private iCloud, in your account. Questions never touch our servers — we don't have any."),
            ], dividerBefore: 3)
            Text("Don't take our word for it. Turn on airplane mode and ask something. Everything still works. There is nothing to disconnect from.")
                .font(.callout)
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    // MARK: page 3 — Apple Intelligence check

    private var ready: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("One engine.\nAlready on your iPhone.")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.white)
            InfoCard(rows: [
                .init(icon: "apple.intelligence", title: "Apple Intelligence",
                      detail: "Ask the Diary answers with the on-device model — no account, no wait, no download."),
                .init(icon: "bolt", title: "Ready now",
                      detail: "First answer in seconds. Works offline, on a plane, anywhere."),
            ])
            Spacer().frame(height: 0)
        }
    }
}

private struct ProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.15))
                Capsule().fill(.white)
                    .frame(width: geo.size.width * progress)
            }
        }
        .frame(height: 3)
        .animation(.snappy, value: progress)
    }
}

struct InfoCard: View {
    struct Row: Identifiable {
        let id = UUID()
        let icon: String
        let title: String
        let detail: String
    }

    let rows: [Row]
    var dividerBefore: Int? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                if i == dividerBefore {
                    Divider().overlay(.white.opacity(0.15))
                }
                HStack(alignment: .top, spacing: 16) {
                    Image(systemName: row.icon)
                        .font(.system(size: 19))
                        .foregroundStyle(.white)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                        Text(row.detail)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.06), in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.1), lineWidth: 1))
    }
}
