import Foundation

// Wire models mirror the Next.js API. Card and message IDs are opaque strings;
// only a newly created chat ID must be a UUID. Keep this file provider-neutral.

public enum MessageRole: String, Codable, Sendable { case user, assistant }
public enum CardKind: String, Codable, CaseIterable, Sendable { case fact, discover }
public enum CitationIssueReason: String, Codable, Sendable {
    case notFetched = "not_fetched"
    case quoteMismatch = "quote_mismatch"

    public var explanation: String {
        switch self {
        case .notFetched:
            "Shalom did not look this passage up before writing the answer, so its wording here may not match the Bible text."
        case .quoteMismatch:
            "The words quoted for this passage do not match the Bible text Shalom looked up."
        }
    }
}

public struct VerseRecord: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var text: String
    public var translation: String
    public init(id: String, label: String, text: String, translation: String = "BSB") {
        self.id = id; self.label = label; self.text = text; self.translation = translation
    }
}

public struct CitationIssue: Codable, Equatable, Sendable {
    public var verseId: String
    public var label: String
    public var reason: CitationIssueReason
    public init(verseId: String, label: String, reason: CitationIssueReason) {
        self.verseId = verseId; self.label = label; self.reason = reason
    }
}

public struct Flashcard: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var kind: CardKind
    public var question: String
    public var answer: String?
    public var explanation: String?
    public var takeaway: String?
    public var refs: [String]
    public var category: String
    public var tags: [String]
    public var minutes: Int?
    public var source: String?
    public var section: String?
    public var tone: String?
    public var difficulty: Int?
    public var authorId: String?
    public var status: String?
    public var createdAt: String?

    public init(id: String, kind: CardKind = .fact, question: String,
                answer: String? = nil, explanation: String? = nil, takeaway: String? = nil,
                refs: [String], category: String, tags: [String] = [], minutes: Int? = nil,
                source: String? = nil, section: String? = nil, tone: String? = nil,
                difficulty: Int? = nil, authorId: String? = nil,
                status: String? = nil, createdAt: String? = nil) {
        self.id = id; self.kind = kind; self.question = question
        self.answer = answer; self.explanation = explanation; self.takeaway = takeaway
        self.refs = refs; self.category = category; self.tags = tags; self.minutes = minutes
        self.source = source; self.section = section; self.tone = tone
        self.difficulty = difficulty; self.authorId = authorId
        self.status = status; self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, question, answer, explanation, takeaway, refs, category, tags,
             minutes, source, section, tone, difficulty, authorId, status, createdAt
    }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decodeIfPresent(CardKind.self, forKey: .kind) ?? .fact
        question = try c.decode(String.self, forKey: .question)
        refs = try c.decode([String].self, forKey: .refs)
        category = try c.decode(String.self, forKey: .category)
        answer = try c.decodeIfPresent(String.self, forKey: .answer)
        explanation = try c.decodeIfPresent(String.self, forKey: .explanation)
        takeaway = try c.decodeIfPresent(String.self, forKey: .takeaway)
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
        minutes = try c.decodeIfPresent(Int.self, forKey: .minutes)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        section = try c.decodeIfPresent(String.self, forKey: .section)
        tone = try c.decodeIfPresent(String.self, forKey: .tone)
        difficulty = try c.decodeIfPresent(Int.self, forKey: .difficulty)
        authorId = try c.decodeIfPresent(String.self, forKey: .authorId)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

public struct FlashcardSummary: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var kind: CardKind
    public var question: String
    public var answer: String?
    public var refs: [String]
    public var category: String
    public init(id: String, kind: CardKind, question: String, answer: String? = nil,
                refs: [String], category: String) {
        self.id = id; self.kind = kind; self.question = question
        self.answer = answer; self.refs = refs; self.category = category
    }
}

public struct FlashcardDraft: Codable, Equatable, Sendable {
    public var question: String
    public var answer: String
    public var explanation: String?
    public var refs: [String]
    public var category: String
    public var tone: String
    public var difficulty: Int?
    public init(question: String, answer: String, explanation: String? = nil,
                refs: [String], category: String, tone: String = "fact", difficulty: Int? = 1) {
        self.question = question; self.answer = answer; self.explanation = explanation
        self.refs = refs; self.category = category; self.tone = tone; self.difficulty = difficulty
    }
}

public struct DeckResponse: Codable, Sendable {
    public var cards: [Flashcard]
    public init(cards: [Flashcard]) { self.cards = cards }
}

public struct Account: Codable, Equatable, Sendable {
    public var email: String?
    public var displayName: String?
    public init(email: String?, displayName: String?) {
        self.email = email; self.displayName = displayName
    }
    public var label: String { displayName ?? email ?? "Your account" }
}

public struct AccountResponse: Codable, Sendable {
    public var enabled: Bool
    public var account: Account?
    public var canSave: Bool
    public init(enabled: Bool, account: Account?, canSave: Bool) {
        self.enabled = enabled; self.account = account; self.canSave = canSave
    }
}

public struct ChatSummary: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var updatedAt: String
    public var messageCount: Int
    public init(id: String, title: String, updatedAt: String, messageCount: Int = 0) {
        self.id = id; self.title = title; self.updatedAt = updatedAt; self.messageCount = messageCount
    }
}

public struct ChatListResponse: Codable, Sendable {
    public var chats: [ChatSummary]
    public var signedIn: Bool
    public var stored: Bool?
    public init(chats: [ChatSummary], signedIn: Bool, stored: Bool? = nil) {
        self.chats = chats; self.signedIn = signedIn; self.stored = stored
    }
}

public struct ChatIdentity: Codable, Sendable {
    public var id: String
    public var title: String
    public init(id: String, title: String) { self.id = id; self.title = title }
}

public struct ChatDocumentResponse: Codable, Sendable {
    public var chat: ChatIdentity
    public var messages: [ChatMessage]
    public init(chat: ChatIdentity, messages: [ChatMessage]) {
        self.chat = chat; self.messages = messages
    }
}

public struct HistoryTurn: Codable, Equatable, Sendable {
    public var role: MessageRole
    public var content: String
    public init(role: MessageRole, content: String) { self.role = role; self.content = content }
}

public struct ChatRequest: Codable, Sendable {
    public var message: String
    public var chatId: String
    public var history: [HistoryTurn]
    public init(message: String, chatId: String, history: [HistoryTurn] = []) {
        self.message = message; self.chatId = chatId; self.history = history
    }
}

public struct ToolStatus: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var done: Bool
    public var ok: Bool?
    public var summary: String?
    public init(id: String, name: String, done: Bool = false, ok: Bool? = nil, summary: String? = nil) {
        self.id = id; self.name = name; self.done = done; self.ok = ok; self.summary = summary
    }
}

public enum MessageDelivery: String, Codable, Sendable {
    case streaming, complete, stopped, incomplete, failed
}

public struct ChatMessage: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var role: MessageRole
    public var text: String
    public var verses: [String: VerseRecord]
    public var unverified: [String: CitationIssueReason]
    public var quoteWarnings: [String]
    public var cards: [FlashcardSummary]
    public var proposal: FlashcardDraft?
    public var error: String?
    public var tools: [ToolStatus]
    public var delivery: MessageDelivery
    /// Only a final citations event (or server-stored evidence) sets this.
    public var hasFinalCitationCheck: Bool

    public init(id: String = UUID().uuidString, role: MessageRole, text: String = "",
                verses: [String: VerseRecord] = [:], unverified: [String: CitationIssueReason] = [:],
                quoteWarnings: [String] = [], cards: [FlashcardSummary] = [],
                proposal: FlashcardDraft? = nil, error: String? = nil, tools: [ToolStatus] = [],
                delivery: MessageDelivery = .complete, hasFinalCitationCheck: Bool = false) {
        self.id = id; self.role = role; self.text = text; self.verses = verses
        self.unverified = unverified; self.quoteWarnings = quoteWarnings; self.cards = cards
        self.proposal = proposal; self.error = error; self.tools = tools
        self.delivery = delivery; self.hasFinalCitationCheck = hasFinalCitationCheck
    }

    enum CodingKeys: String, CodingKey {
        case id, role, text, verses, unverified, quoteWarnings, cards, proposal, error,
             tools, delivery, hasFinalCitationCheck, checked
    }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        role = try c.decode(MessageRole.self, forKey: .role)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        verses = try c.decodeIfPresent([String: VerseRecord].self, forKey: .verses) ?? [:]
        unverified = try c.decodeIfPresent([String: CitationIssueReason].self, forKey: .unverified) ?? [:]
        quoteWarnings = try c.decodeIfPresent([String].self, forKey: .quoteWarnings) ?? []
        cards = try c.decodeIfPresent([FlashcardSummary].self, forKey: .cards) ?? []
        proposal = try c.decodeIfPresent(FlashcardDraft.self, forKey: .proposal)
        error = try c.decodeIfPresent(String.self, forKey: .error)
        tools = try c.decodeIfPresent([ToolStatus].self, forKey: .tools) ?? []
        delivery = try c.decodeIfPresent(MessageDelivery.self, forKey: .delivery) ?? .complete
        // A legacy payload with verses and an empty unverified map is not
        // proof that a final check ran. The server supplies explicit provenance;
        // a local cache preserves the reducer's flag. Missing means unchecked.
        let localCheck = try c.decodeIfPresent(Bool.self, forKey: .hasFinalCitationCheck)
        let serverCheck = try c.decodeIfPresent(Bool.self, forKey: .checked)
        hasFinalCitationCheck = (localCheck ?? serverCheck ?? false)
            && delivery == .complete && error == nil
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(role, forKey: .role)
        try c.encode(text, forKey: .text)
        try c.encode(verses, forKey: .verses)
        try c.encode(unverified, forKey: .unverified)
        try c.encode(quoteWarnings, forKey: .quoteWarnings)
        try c.encode(cards, forKey: .cards)
        try c.encodeIfPresent(proposal, forKey: .proposal)
        try c.encodeIfPresent(error, forKey: .error)
        try c.encode(tools, forKey: .tools)
        try c.encode(delivery, forKey: .delivery)
        try c.encode(hasFinalCitationCheck, forKey: .hasFinalCitationCheck)
    }
}

public struct ChatThread: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var updatedAt: String
    public var messages: [ChatMessage]
    public init(id: String = UUID().uuidString.lowercased(), title: String = "New chat",
                updatedAt: String = ISO8601DateFormatter().string(from: Date()),
                messages: [ChatMessage] = []) {
        self.id = UUID(uuidString: id)?.uuidString.lowercased() ?? id
        self.title = title; self.updatedAt = updatedAt; self.messages = messages
    }
    public var summary: ChatSummary {
        ChatSummary(id: id, title: title, updatedAt: updatedAt, messageCount: messages.count)
    }
}

public struct ChatImportEntry: Codable, Sendable {
    public var id: String
    public var title: String
    public var updatedAt: String
    public var messages: [ChatImportMessage]
    public init(id: String, title: String, updatedAt: String, messages: [ChatImportMessage]) {
        self.id = id; self.title = title; self.updatedAt = updatedAt; self.messages = messages
    }
}
public struct ChatImportMessage: Codable, Sendable {
    public var role: MessageRole
    public var text: String
    public init(role: MessageRole, text: String) { self.role = role; self.text = text }
}
public struct ChatImportRequest: Codable, Sendable {
    public var chats: [ChatImportEntry]
    public init(chats: [ChatImportEntry]) { self.chats = chats }
}
public struct ChatImportResponse: Codable, Sendable {
    public var saved: [String]
    public var skipped: [String]
    public init(saved: [String], skipped: [String]) { self.saved = saved; self.skipped = skipped }
}

/// Provider errors distinguish a temporary refresh outage from rejected login.
/// Neither is allowed to silently downgrade an account request to guest.
public enum AccessTokenProviderFailure: Error, Sendable {
    case unavailable
    case rejected
}

/// The app adapter supplies a refreshed token; the core never stores auth tokens.
public protocol AccessTokenProvider: Sendable {
    func accessToken() async throws -> String?
}
public struct GuestTokenProvider: AccessTokenProvider {
    public init() {}
    public func accessToken() async throws -> String? { nil }
}
