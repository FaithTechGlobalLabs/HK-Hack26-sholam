import Foundation

/// The history the app sends with each chat turn, matching the web client
/// (`trimHistory` with `LIMITS.client` and `LIMITS.model.historyTurnChars`).
///
/// Sizes are UTF-16 code units, like JavaScript's `String.length`, which is
/// what the server measures. Clipping never splits a Swift `Character`
/// (grapheme cluster), so no lone surrogate or broken emoji is sent.
public enum HistoryPolicy {
    public static let maxTurns = 12
    public static let maxTotalCharacters = 16_000
    public static let maxTurnCharacters = 1_200
    /// The server's request limits (`LIMITS.request`), for local validation.
    public static let maxRequestHistoryItems = 200
    public static let maxRequestHistoryItemCharacters = 20_000
    public static let maxMessageCharacters = 8_000

    /// `clip` from `context.ts`: at most `max` UTF-16 units, ending in "…"
    /// when cut, cut on a grapheme boundary.
    public static func clip(_ text: String, maxUTF16 max: Int) -> String {
        guard max > 0 else { return "" }
        if text.utf16.count <= max { return text }
        let budget = max - 1 // room for "…" (one UTF-16 unit)
        var used = 0
        var end = text.startIndex
        for index in text.indices {
            let next = text.index(after: index)
            let clusterWidth = text[index..<next].utf16.count
            if used + clusterWidth > budget { break }
            used += clusterWidth
            end = next
        }
        return String(text[..<end]) + "…"
    }

    /// The newest turns that fit 12 turns and 16,000 units, each clipped to
    /// 1,200 units, skipping blank turns and starting on a user turn.
    public static func trim(_ turns: [HistoryTurn]) -> [HistoryTurn] {
        var out: [HistoryTurn] = []
        var total = 0
        for turn in turns.reversed() {
            if out.count >= maxTurns { break }
            let content = clip(turn.content, maxUTF16: maxTurnCharacters)
            if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            let size = content.utf16.count
            if total + size > maxTotalCharacters { break }
            total += size
            out.append(HistoryTurn(role: turn.role, content: content))
        }
        out.reverse()
        while let first = out.first, first.role != .user { out.removeFirst() }
        return out
    }

    /// History for the next request from the visible messages: text turns
    /// only (as the web sends), excluding any message still streaming.
    public static func forMessages(_ messages: [ChatMessage]) -> [HistoryTurn] {
        trim(messages
            .filter { $0.delivery != .streaming && !$0.text.isEmpty }
            .map { HistoryTurn(role: $0.role, content: $0.text) })
    }
}
