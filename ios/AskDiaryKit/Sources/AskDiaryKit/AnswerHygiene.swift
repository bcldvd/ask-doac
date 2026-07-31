import Foundation

/// Post-generation quality checks for the ~3B on-device model.
///
/// Two observed failure modes (QA pass 2026-07-31, temperature 0.7):
/// - repetition loops: one sentence paraphrased 3+ times until the token cap
/// - token-cap truncation: the answer ends mid-sentence
public enum AnswerHygiene {
    /// True when the answer collapsed into a repetition loop: 3+ sentences
    /// open with the same words. Loops rarely repeat verbatim — each pass
    /// tacks more onto the end — so the opening is the stable signature.
    public static func looksDegenerate(_ text: String) -> Bool {
        var counts: [String: Int] = [:]
        for sentence in sentences(of: text) {
            let words = sentence.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
            guard words.count >= 8 else { continue }
            let key = words.prefix(12).joined(separator: " ")
            counts[key, default: 0] += 1
            if counts[key]! >= 3 { return true }
        }
        return false
    }

    /// Drops an unterminated trailing fragment (token-cap cutoff), keeping the
    /// text intact when it already ends cleanly or when trimming would gut it.
    public static func trimmedTail(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let last = trimmed.last else { return trimmed }
        let terminal: Set<Character> = [".", "!", "?", "\"", "”", "’", ")", "]"]
        if terminal.contains(last) { return trimmed }
        // cut back to the last terminal punctuation
        if let cut = trimmed.lastIndex(where: { terminal.contains($0) }) {
            let kept = String(trimmed[...cut])
            // never trim away most of the answer over a missing period
            if kept.count >= 40, kept.count * 2 >= trimmed.count { return kept }
        }
        return trimmed
    }

    private static func sentences(of text: String) -> [String] {
        text.components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}
