import SwiftUI

/// DOAC volt-on-black design tokens — the iOS twin of docs/design-system.md.
/// Pure black surfaces separated by hairlines, white text, volt for anything
/// interactive, red strictly for live/error semantics.
enum DS {
    static let black = Color.black
    static let volt = Color("Volt")
    static let line = Color("Line")
    static let muted = Color("Muted")
    static let faint = Color("Faint")
    static let panel = Color("Panel")
    static let red = Color("SignalRed")

    /// Zuume stand-in (Anton): ALL-CAPS display type. Pair with .textCase(.uppercase).
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom("Anton-Regular", size: size, relativeTo: style)
    }

    /// Paralucent stand-in (Barlow): body copy, light-leaning weights.
    static func body(_ size: CGFloat = 17, _ weight: BarlowWeight = .regular,
                     relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.rawValue, size: size, relativeTo: style)
    }

    enum BarlowWeight: String {
        case light = "Barlow-Light"
        case regular = "Barlow-Regular"
        case medium = "Barlow-Medium"
        case semibold = "Barlow-SemiBold"
    }

    /// Spline Sans Mono: timestamps, citation numbers, status readouts.
    static func mono(_ size: CGFloat, relativeTo style: Font.TextStyle = .caption) -> Font {
        .custom("SplineSansMono-Regular", size: size, relativeTo: style)
    }
}

/// Mono small-caps utility label ("YOU ASKED", "EARLIER SESSIONS", …).
struct CapsLabel: View {
    let text: String
    var color: Color = DS.faint

    var body: some View {
        Text(text)
            .font(DS.mono(11))
            .kerning(1.3)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}
