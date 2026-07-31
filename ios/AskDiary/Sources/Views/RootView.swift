import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("onboarded") private var onboarded = false

    private var skipOnboarding: Bool {
        ProcessInfo.processInfo.arguments.contains("-SkipOnboarding")
    }

    init() {
        // scripted QA: -ResetOnboarding forces the first-run flow
        if ProcessInfo.processInfo.arguments.contains("-ResetOnboarding") {
            UserDefaults.standard.set(false, forKey: "onboarded")
        }
    }

    var body: some View {
        Group {
            if onboarded || skipOnboarding {
                StudioView()
            } else {
                OnboardingView { onboarded = true }
            }
        }
        .task { await app.warmUp() }
        .preferredColorScheme(.dark)  // the studio is always dark
    }
}

/// The main room: hero or history + composer + streaming answer.
struct StudioView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.modelContext) private var context
    @Query(sort: \Message.createdAt, order: .reverse) private var history: [Message]
    @State private var question = ""
    @FocusState private var askFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            Color.clear.frame(height: 1).id("top")
                            if !app.engine.isAvailable {
                                UnsupportedCard(reason: app.engine.unavailableReason)
                            }
                            if let session = app.current {
                                AnswerView(session: session)
                            } else if history.isEmpty && app.engine.isAvailable {
                                HeroView { submit($0) }
                            } else if !history.isEmpty {
                                HistoryList(messages: history)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    // follow the stream so new text never hides under the composer
                    .onChange(of: app.current?.answerText) {
                        guard app.isStreaming else { return }
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                    // screenshot tooling: park on the question once the answer lands
                    .onChange(of: app.current?.phase) {
                        if app.current?.phase == .done,
                            ProcessInfo.processInfo.arguments.contains("-ScrollTopWhenDone") {
                            withAnimation { proxy.scrollTo("top", anchor: .top) }
                        }
                    }
                }
                // warm-up readout: a loadline under the toolbar, then nothing
                if !app.onAir && app.engine.isAvailable {
                    VStack(spacing: 0) {
                        LoadLine()
                        Spacer()
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    LogoBox()
                }
                .sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        HistoryScreen()
                    } label: {
                        Image(systemName: "clock")
                            .foregroundStyle(DS.muted)
                    }
                    .accessibilityLabel("History")
                }
            }
            .toolbarBackground(.black, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                AskBar(text: $question, focused: $askFocused, busy: app.isStreaming) {
                    submit()
                }
            }
            .task {
                // scripted QA/screenshots: -AutoAsk "question"
                let args = ProcessInfo.processInfo.arguments
                if let i = args.firstIndex(of: "-AutoAsk"), app.current == nil {
                    question = args.indices.contains(i + 1) && !args[i + 1].hasPrefix("-")
                        ? args[i + 1] : "what did the sleep expert say about caffeine?"
                    submit()
                }
            }
        }
    }

    private func submit(_ preset: String? = nil) {
        let q = (preset ?? question).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !app.isStreaming else { return }
        question = ""
        askFocused = false
        Task {
            let session = await app.ask(q)
            if session.phase == .done {
                let message = Message(question: q)
                message.answer = session.answerText
                message.citations = session.citations
                context.insert(message)
            }
        }
    }
}

/// The web hero: mono eyebrow, Anton headline with the volt highlight mark,
/// muted sub, question cards.
struct HeroView: View {
    let ask: (String) -> Void
    @Environment(AppModel.self) private var app

    private let cards = [
        "What actually makes people rich?",
        "How do I fix my sleep?",
        "What morning habits do guests swear by?",
        "How do I start a business with no money?",
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CapsLabel(text: "228 episodes · every word indexed", color: DS.muted)
                .padding(.top, 36)
                .padding(.bottom, 20)

            Text("THE DIARY")
                .font(DS.display(54, relativeTo: .largeTitle))
                .foregroundStyle(.white)
            Text("ANSWERS BACK")
                .font(DS.display(54, relativeTo: .largeTitle))
                .foregroundStyle(.black)
                .padding(.horizontal, 8)
                .padding(.bottom, 2)
                .background(DS.volt)
                .padding(.top, 6)

            Text("Ask a question and get an answer built only from what Steven Bartlett and his guests actually said — cited to the minute. Nothing you type leaves this iPhone.")
                .font(DS.body(16, .light))
                .foregroundStyle(DS.muted)
                .lineSpacing(4)
                .padding(.top, 20)
                .padding(.bottom, 32)

            VStack(spacing: 10) {
                ForEach(cards, id: \.self) { card in
                    Button {
                        ask(card)
                    } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 7) {
                            Text("Q.")
                                .font(DS.display(15, relativeTo: .callout))
                                .foregroundStyle(DS.volt)
                            Text(card)
                                .font(DS.body(16, .medium))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 15)
                        .background(.black, in: .rect(cornerRadius: 20))
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(DS.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(!app.onAir)
                    .opacity(app.onAir ? 1 : 0.55)
                }
            }
        }
    }
}

/// The studio when the phone can't run Apple Intelligence: plain words,
/// no dead ends — search still works, so history and sources remain useful.
struct UnsupportedCard: View {
    let reason: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("THE MIC IS OFF")
                .font(DS.display(16, relativeTo: .headline))
                .foregroundStyle(DS.red)
            Text(reason ?? "Apple Intelligence isn't available on this iPhone.")
                .font(DS.body(15, .light))
                .foregroundStyle(DS.muted)
            Text("Ask the Diary needs it to answer. If your iPhone supports it, turn it on in Settings → Apple Intelligence & Siri, then come back.")
                .font(DS.body(15, .light))
                .foregroundStyle(DS.muted)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black, in: .rect(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(DS.red, lineWidth: 1))
        .padding(.top, 24)
    }
}
