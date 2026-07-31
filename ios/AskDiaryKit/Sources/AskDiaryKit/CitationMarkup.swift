import Foundation

/// Splits an answer into prose and citation-marker segments.
///
/// The prompt asks for `[n]`, but the 3B model drifts: `(1)`, `(2, 3)` and
/// `[2, 3]` all show up in real answers. Any bracket/paren group whose numbers
/// are ALL valid citation ids is treated as citations; anything else stays
/// literal prose (so "grew (3) times" survives when there are < 3 sources).
public enum CitationMarkup {
    public enum Segment: Equatable {
        case prose(String)
        case citation(Int)
    }

    public static func segments(of text: String, validIDs: Set<Int>) -> [Segment] {
        var out: [Segment] = []
        var rest = Substring(text)
        let pattern = #"[\[(]\s*\d+(\s*,\s*\d+)*\s*[\])]"#
        while let range = rest.range(of: pattern, options: .regularExpression) {
            let token = rest[range]
            let numbers = token.dropFirst().dropLast()
                .split(separator: ",")
                .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            let isCitation = !numbers.isEmpty && numbers.allSatisfy(validIDs.contains)
            let head = String(rest[..<range.lowerBound])
            if isCitation {
                if !head.isEmpty { out.append(.prose(head)) }
                out.append(contentsOf: numbers.map(Segment.citation))
            } else {
                out.append(.prose(head + token))
            }
            rest = rest[range.upperBound...]
        }
        if !rest.isEmpty { out.append(.prose(String(rest))) }
        // merge adjacent prose so callers see minimal segments
        return out.reduce(into: []) { acc, seg in
            if case .prose(let p) = seg, case .prose(let q)? = acc.last {
                acc[acc.count - 1] = .prose(q + p)
            } else {
                acc.append(seg)
            }
        }
    }
}
