import SwiftUI

/// The signature element: a glass capsule that reads ON AIR and breathes red
/// while the model is generating — the studio light above the door.
struct OnAirBadge: View {
    let on: Bool
    let busy: Bool
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(on ? Color("SignalRed") : Color("Brass").opacity(0.4))
                .frame(width: 7, height: 7)
                .shadow(color: glowColor, radius: busy && breathe ? 7 : 2)
            Text(on ? "ON AIR" : "WARMING UP")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .kerning(1.2)
                .foregroundStyle(on ? Color("Paper") : Color("Brass"))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .glassEffect(.regular, in: .capsule)
        .onChange(of: busy) { _, isBusy in
            guard !reduceMotion else { return }
            withAnimation(isBusy ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default) {
                breathe = isBusy
            }
        }
        .accessibilityLabel(on ? (busy ? "Answering" : "Ready") : "Loading")
    }

    private var glowColor: Color {
        on ? Color("SignalRed").opacity(busy ? 0.9 : 0.5) : .clear
    }
}

/// Bottom ask field: a glass bar with a mic-adjacent send button.
struct AskBar: View {
    @Binding var text: String
    var focused: FocusState<Bool>.Binding
    let busy: Bool
    let submit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TextField("Ask the diary…", text: $text, axis: .vertical)
                .focused(focused)
                .lineLimit(1...4)
                .font(.body)
                .submitLabel(.send)
                .onSubmit(submit)
                .disabled(busy)
            Button(action: submit) {
                Image(systemName: busy ? "waveform" : "arrow.up")
                    .fontWeight(.semibold)
                    .symbolEffect(.variableColor.iterative, isActive: busy)
            }
            .buttonStyle(.glassProminent)
            .tint(Color("SignalRed"))
            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty && !busy)
            .accessibilityLabel(busy ? "Answering" : "Send question")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: 26))
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }
}
