import Foundation

/// Events from `POST /api/chat`, mirroring `src/lib/agent/events.ts`.
/// Each SSE frame is `event: <type>` + `data: <json without type>`.
public enum AgentEvent: Equatable, Sendable {
    case textDelta(String)
    case toolStart(id: String, name: String, input: JSONValue)
    case toolResult(id: String, name: String, ok: Bool, summary: String)
    case verses([VerseRecord])
    case flashcards([FlashcardSummary])
    case flashcardProposal(FlashcardDraft)
    /// Replace the streamed answer text with `text` (nil = empty).
    case reset(reason: String, text: String?)
    /// The final citation check, sent once before `done`.
    case citations(unverified: [CitationIssue], quoteWarnings: [String])
    /// `saved` is optional: older servers omit it.
    case done(stopReason: String, messageId: String?, saved: Bool?)
    case error(String)

    /// The wire event names, as `encodeEvent` writes them.
    public static let knownNames: Set<String> = [
        "text_delta", "tool_start", "tool_result", "verses", "flashcards",
        "flashcard_proposal", "reset", "citations", "done", "error",
    ]

    public var isTerminal: Bool {
        switch self {
        case .done, .error: true
        default: false
        }
    }

    /// Decodes one frame by its event name. Returns nil for an unknown name;
    /// throws when a known event's payload does not match its type.
    public static func decode(name: String, data: Data) throws -> AgentEvent? {
        guard knownNames.contains(name) else { return nil }
        let decoder = JSONDecoder()
        switch name {
        case "text_delta":
            return .textDelta(try decoder.decode(TextDelta.self, from: data).text)
        case "tool_start":
            let p = try decoder.decode(ToolStart.self, from: data)
            return .toolStart(id: p.id, name: p.name, input: p.input ?? .null)
        case "tool_result":
            let p = try decoder.decode(ToolResult.self, from: data)
            return .toolResult(id: p.id, name: p.name, ok: p.ok, summary: p.summary)
        case "verses":
            return .verses(try decoder.decode(Verses.self, from: data).verses)
        case "flashcards":
            return .flashcards(try decoder.decode(Cards.self, from: data).cards)
        case "flashcard_proposal":
            return .flashcardProposal(try decoder.decode(Proposal.self, from: data).draft)
        case "reset":
            let p = try decoder.decode(Reset.self, from: data)
            return .reset(reason: p.reason, text: p.text)
        case "citations":
            let p = try decoder.decode(Citations.self, from: data)
            return .citations(unverified: p.unverified, quoteWarnings: p.quoteWarnings)
        case "done":
            let p = try decoder.decode(Done.self, from: data)
            return .done(stopReason: p.stopReason, messageId: p.messageId, saved: p.saved)
        case "error":
            return .error(try decoder.decode(ErrorPayload.self, from: data).message)
        default:
            return nil
        }
    }

    private struct TextDelta: Decodable { let text: String }
    private struct ToolStart: Decodable { let id: String; let name: String; let input: JSONValue? }
    private struct ToolResult: Decodable { let id: String; let name: String; let ok: Bool; let summary: String }
    private struct Verses: Decodable { let verses: [VerseRecord] }
    private struct Cards: Decodable { let cards: [FlashcardSummary] }
    private struct Proposal: Decodable { let draft: FlashcardDraft }
    private struct Reset: Decodable { let reason: String; let text: String? }
    private struct Citations: Decodable { let unverified: [CitationIssue]; let quoteWarnings: [String] }
    private struct Done: Decodable { let stopReason: String; let messageId: String?; let saved: Bool? }
    private struct ErrorPayload: Decodable { let message: String }
}
