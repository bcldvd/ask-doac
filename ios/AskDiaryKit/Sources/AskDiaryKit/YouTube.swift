import Foundation

public enum YouTube {
    /// '01:15:08' → 4508. Accepts HH:MM:SS or MM:SS; garbage → 0.
    public static func timestampToSeconds(_ ts: String) -> Int {
        let parts = ts.split(separator: ":", omittingEmptySubsequences: false).map { Int($0) }
        guard parts.count >= 2, parts.count <= 3, !parts.contains(nil) else { return 0 }
        return parts.compactMap { $0 }.reduce(0) { $0 * 60 + $1 }
    }

    /// Deep link into the episode's YouTube video at the excerpt's timestamp.
    public static func url(videoId: String, timestamp: String) -> URL {
        let s = timestampToSeconds(timestamp)
        let suffix = s > 0 ? "&t=\(s)s" : ""
        return URL(string: "https://www.youtube.com/watch?v=\(videoId)\(suffix)")!
    }
}
