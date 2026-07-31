import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var app
    @AppStorage("onboarded") private var onboarded = false

    private var skipOnboarding: Bool {
        ProcessInfo.processInfo.arguments.contains("-SkipOnboarding")
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

/// The main room: history + ask bar + streaming answer.
struct StudioView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.modelContext) private var context
    @Query(sort: \Message.createdAt, order: .reverse) private var history: [Message]
    @State private var question = ""
    @FocusState private var askFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                StudioBackground()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            if let session = app.current {
                                AnswerView(session: session)
                            } else if history.isEmpty {
                                EmptyStudioView(suggestion: askSuggestion)
                            } else {
                                HistoryList(messages: history)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    // follow the stream so new text never hides under the ask bar
                    .onChange(of: app.current?.answerText) {
                        guard app.isStreaming else { return }
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }
            .navigationTitle("Ask the Diary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    OnAirBadge(on: app.onAir, busy: app.isStreaming)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        HistoryScreen()
                    } label: {
                        Image(systemName: "clock")
                    }
                }
            }
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

    private var askSuggestion: String {
        [
            "What did the sleep expert say about caffeine?",
            "How do I get better at hard conversations?",
            "Is it too late to start training in my 60s?",
        ].randomElement()!
    }

    private func submit() {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
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

/// Warm near-black wash with a faint tungsten glow at the top — the room.
struct StudioBackground: View {
    var body: some View {
        ZStack {
            Color(red: 0.051, green: 0.043, blue: 0.035)
            RadialGradient(
                colors: [Color(red: 0.16, green: 0.09, blue: 0.05).opacity(0.8), .clear],
                center: .top, startRadius: 0, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}

struct EmptyStudioView: View {
    let suggestion: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("228 episodes.\nEvery answer cited to the minute.")
                .font(.system(.title, design: .serif, weight: .semibold))
                .foregroundStyle(Color("Paper"))
                .padding(.top, 48)
            Text("Try “\(suggestion)”")
                .font(.callout)
                .foregroundStyle(Color("Brass"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
