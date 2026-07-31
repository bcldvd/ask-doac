import SwiftUI

/// Onboarding modeled on Slate - Private Journal (user-provided reference):
/// pure dark pages, a thin progress bar, one bold plain-spoken headline,
/// an icon-row card, muted proof copy, a single white pill button.
struct OnboardingView: View {
    @Environment(AppModel.self) private var app
    let done: () -> Void
    @State private var page: Int

    init(done: @escaping () -> Void) {
        self.done = done
        // scripted QA/screenshots: -OnboardingPage 0|1|2 jumps straight to a page
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-OnboardingPage"), args.indices.contains(i + 1),
            let n = Int(args[i + 1]), (0...2).contains(n) {
            _page = State(initialValue: n)
        } else {
            _page = State(initialValue: 0)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                if page > 0 {
                    Button {
                        withAnimation(.snappy) { page -= 1 }
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .accessibilityLabel("Back")
                    .transition(.opacity)
                }
                ProgressBar(progress: Double(page + 1) / 3)
            }
            .padding(.top, 24)
            .padding(.bottom, 40)

            // scrolls when large text sizes outgrow the screen — never crop copy
            ScrollView {
                Group {
                    switch page {
                    case 0: whatItIs
                    case 1: privacy
                    default: ready
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button {
                if page < 2 {
                    withAnimation(.snappy) { page += 1 }
                } else {
                    done()
                }
            } label: {
                Text(page < 2 ? "CONTINUE" : "START ASKING")
                    .font(DS.display(16, relativeTo: .headline))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(DS.volt, in: .capsule)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
        }
        .padding(.horizontal, 24)
        .background(Color.black.ignoresSafeArea())
    }

    // MARK: page 1 — what it is

    private var whatItIs: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("400 HOURS OF DIARY OF A CEO.\nANSWERED IN SECONDS.")
                .font(DS.display(34, relativeTo: .largeTitle))
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
                .font(DS.body(15, .light))
                .foregroundStyle(DS.muted)
        }
    }

    // MARK: page 2 — privacy, the Slate page

    private var privacy: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("WE CANNOT SEE YOUR QUESTIONS.\nNOT WON'T, CAN'T.")
                .font(DS.display(34, relativeTo: .largeTitle))
                .foregroundStyle(.white)
            InfoCard(rows: [
                .init(icon: "magnifyingglass", title: "Your question",
                      detail: "Understood and searched on this phone."),
                .init(icon: "books.vertical", title: "The transcripts",
                      detail: "Stored inside the app. Nothing is fetched."),
                .init(icon: "brain", title: "The answer",
                      detail: "Apple's on-device model. It never phones home."),
                .init(icon: "icloud", title: "iCloud sync, optional",
                      detail: "History syncs encrypted to your private iCloud. It never touches our servers — we don't have any."),
            ], dividerBefore: 3)
            Text("Don't take our word for it. Turn on airplane mode and ask something. Everything still works. There is nothing to disconnect from.")
                .font(DS.body(15, .light))
                .foregroundStyle(DS.muted)
        }
    }

    // MARK: page 3 — Apple Intelligence check

    private var ready: some View {
        VStack(alignment: .leading, spacing: 28) {
            Text("ONE ENGINE.\nALREADY ON YOUR IPHONE.")
                .font(DS.display(34, relativeTo: .largeTitle))
                .foregroundStyle(.white)
            InfoCard(rows: [
                .init(icon: "apple.intelligence", title: "Apple Intelligence",
                      detail: "Most AI apps send your questions to a server — OpenAI's, Google's. This one answers with the model already on your iPhone. Nothing leaves it."),
                .init(icon: "bolt", title: "Ready now",
                      detail: "No account, no download. First answer in seconds — offline, on a plane, anywhere."),
            ])
            availabilityCheck
            Spacer().frame(height: 0)
        }
    }

    /// The promised check: is Apple Intelligence actually ready on this phone?
    private var availabilityCheck: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: app.engine.isAvailable ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .font(.system(size: 19))
                .foregroundStyle(app.engine.isAvailable ? DS.volt : DS.red)
            VStack(alignment: .leading, spacing: 3) {
                Text(app.engine.isAvailable
                    ? "Checked: Apple Intelligence is on"
                    : "Apple Intelligence isn't ready")
                    .font(DS.body(16, .semibold))
                    .foregroundStyle(.white)
                Text(app.engine.isAvailable
                    ? "This iPhone can answer right now."
                    : (app.engine.unavailableReason ?? "Check Settings, then come back."))
                    .font(DS.body(14, .light))
                    .foregroundStyle(DS.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(app.engine.isAvailable ? DS.volt : DS.red, lineWidth: 1))
    }
}

private struct ProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color("Line"))
                Capsule().fill(Color("Volt"))
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
                    Divider().overlay(Color("Line"))
                }
                HStack(alignment: .top, spacing: 16) {
                    Image(systemName: row.icon)
                        .font(.system(size: 19))
                        .foregroundStyle(.white)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(row.title)
                            .font(DS.body(16, .semibold))
                            .foregroundStyle(.white)
                        Text(row.detail)
                            .font(DS.body(14, .light))
                            .foregroundStyle(Color("Muted"))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black, in: .rect(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20).stroke(Color("Line"), lineWidth: 1))
    }
}
