import SwiftUI

/// The web header's wordmark: black condensed caps in a white box.
struct LogoBox: View {
    var body: some View {
        Text("ASK DOAC")
            .font(DS.display(15, relativeTo: .headline))
            .foregroundStyle(.black)
            .padding(.horizontal, 7)
            .padding(.top, 4)
            .padding(.bottom, 3)
            .background(.white)
            .fixedSize()
            .accessibilityLabel("Ask DOAC")
    }
}

/// The web header's loadline: a 2 px volt sweep under the toolbar, shown only
/// while the index/model warm up. Replaces the old ON AIR badge — once the
/// studio is ready there is nothing to show.
struct LoadLine: View {
    @State private var sweep = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                DS.line
                DS.volt
                    .frame(width: geo.size.width * 0.4)
                    .offset(x: sweep ? geo.size.width : -geo.size.width * 0.4)
            }
        }
        .frame(height: 2)
        .clipped()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false)) {
                sweep = true
            }
        }
        .accessibilityLabel("Loading")
    }
}

/// Bottom composer: pill input on a hairline, volt disc with a black arrow.
struct AskBar: View {
    @Binding var text: String
    var focused: FocusState<Bool>.Binding
    let busy: Bool
    let submit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TextField("Ask the diary anything…", text: $text, axis: .vertical)
                .focused(focused)
                .lineLimit(1...4)
                .font(DS.body(16))
                .foregroundStyle(.white)
                .tint(DS.volt)
                .submitLabel(.send)
                .onSubmit(submit)
                .disabled(busy)
                .padding(.horizontal, 18)
                .padding(.vertical, 13)
                .background(.black, in: .rect(cornerRadius: 26))
                .overlay(RoundedRectangle(cornerRadius: 26).stroke(DS.line, lineWidth: 1))

            Button(action: submit) {
                ZStack {
                    Circle().fill(sendDisabled ? DS.panel : DS.volt)
                    if busy {
                        ProgressView().tint(DS.faint).scaleEffect(0.8)
                    } else {
                        Image(systemName: "arrow.right")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(sendDisabled ? DS.faint : .black)
                    }
                }
                .frame(width: 46, height: 46)
            }
            .disabled(sendDisabled)
            .accessibilityLabel(busy ? "Answering" : "Send question")
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(
            LinearGradient(colors: [.black.opacity(0), .black], startPoint: .top, endPoint: .bottom)
                .padding(.top, -24)
                .ignoresSafeArea(edges: .bottom))
    }

    private var sendDisabled: Bool {
        busy || text.trimmingCharacters(in: .whitespaces).isEmpty
    }
}
