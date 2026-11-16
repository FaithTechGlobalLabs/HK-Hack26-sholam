import Foundation
import ShalomCore

/// Which cards the deck shows (web: the All / Quick facts / Discover switch).
enum DeckFilter: String, CaseIterable, Identifiable, Sendable {
    case all, fact, discover

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .fact: "Quick facts"
        case .discover: "Discover"
        }
    }

    var kind: CardKind? {
        switch self {
        case .all: nil
        case .fact: .fact
        case .discover: .discover
        }
    }
}

/// Pure deck logic shared by the screen and its tests. Mirrors
/// `src/lib/flashcards/shuffle.ts` and the strings in `SwipeDeck.tsx`.
/// Teaching content (questions, answers, takeaways, explanations, refs) is
/// shown exactly as delivered; nothing here rewrites it.
enum FlashcardDeck {
    // MARK: Order

    /// A new visit's order: the card IDs in uniformly random order.
    static func shuffledOrder(of cards: [Flashcard]) -> [String] {
        cards.map(\.id).shuffled()
    }

    static func shuffledOrder<G: RandomNumberGenerator>(of cards: [Flashcard],
                                                       using generator: inout G) -> [String] {
        cards.map(\.id).shuffled(using: &generator)
    }

    /// A different set of card IDs means a different deck, which gets a new
    /// shuffle. Edited content under the same IDs keeps the visit's order.
    static func needsReshuffle(order: [String], cards: [Flashcard]) -> Bool {
        Set(order) != Set(cards.map(\.id)) || order.count != cards.count
    }

    /// What the deck shows: the visit's order, narrowed to one kind when a
    /// filter is on, with the focused card (linked from chat) moved to the
    /// front. Filtering keeps the shuffled order, so switching filters never
    /// reshuffles. A focus ID not in the filtered deck changes nothing.
    static func view(order: [String], cards: [Flashcard], filter: DeckFilter,
                     focusID: String?) -> [Flashcard] {
        var byID: [String: Flashcard] = [:]
        for card in cards where byID[card.id] == nil { byID[card.id] = card }
        var seen = Set<String>()
        var ordered: [Flashcard] = []
        ordered.reserveCapacity(cards.count)
        for id in order {
            guard let card = byID[id], seen.insert(id).inserted else { continue }
            ordered.append(card)
        }
        // Defensive: a card that arrived without a reshuffle still shows.
        for card in cards where seen.insert(card.id).inserted { ordered.append(card) }

        if let kind = filter.kind { ordered = ordered.filter { $0.kind == kind } }
        if let focusID, let at = ordered.firstIndex(where: { $0.id == focusID }), at > 0 {
            ordered.insert(ordered.remove(at: at), at: 0)
        }
        return ordered
    }

    // MARK: Position

    /// `index` clamped into a deck of `count` cards, or nil for an empty
    /// deck. A deck that shrank under a stale position lands on its last card.
    static func clampedIndex(_ index: Int, count: Int) -> Int? {
        guard count > 0 else { return nil }
        return min(max(index, 0), count - 1)
    }

    /// The card positions within `radius` of `index` (clamped first), in
    /// order. Always valid indices of a `count`-card deck; empty when the
    /// deck is empty, never an inverted range.
    static func window(around index: Int, count: Int, radius: Int) -> [Int] {
        guard let centre = clampedIndex(index, count: count) else { return [] }
        let r = min(max(0, radius), count)
        return Array(max(0, centre - r)...min(count - 1, centre + r))
    }

    // MARK: Ask Shalom

    /// What "Ask Shalom" hands to chat (web `chatRequest`). Discover cards
    /// are open questions, so the request is to explore them from their
    /// starting passages, not to answer them.
    static func chatRequest(for card: Flashcard) -> String {
        let passages = card.refs.map { ReferenceFormatter.label(for: $0) }.joined(separator: " and ")
        if card.kind == .discover {
            return "Help me explore this question: \(card.question) Start from \(passages)."
        }
        return "Give a profound explanation of \(passages), in answer to: \(card.question)"
    }

    // MARK: Labels

    static func kindLabel(_ card: Flashcard) -> String {
        card.kind == .discover ? "Discover" : "Quick fact"
    }

    /// `src/lib/flashcards/types.ts` CATEGORY_LABELS. Unknown slugs read as
    /// words rather than raw identifiers.
    static func categoryLabel(_ slug: String) -> String {
        if let label = categoryLabels[slug] { return label }
        let words = slug.split(separator: "-").joined(separator: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }

    static let categoryLabels: [String: String] = [
        "jesus": "Jesus",
        "god": "God",
        "old-testament": "Old Testament",
        "new-testament": "New Testament",
        "people": "People",
        "places": "Places",
        "miracles": "Miracles",
        "numbers": "Numbers",
        "fun-facts": "Fun facts",
        "life-identity": "Everyday life & identity",
        "jesus-details": "Jesus: the unexpected details",
        "surprising-stories": "Strange & surprising stories",
        "jesus-times": "Life in Jesus' time",
        "big-questions": "Big questions",
        "modern-world": "Faith & the modern world",
        "science-history": "Science, history & the Bible",
        "prayer-purpose": "Prayer & purpose",
        "wait-really": "Wait, that's in the Bible?",
    ]

    /// Discover tags, minus any that only repeat the category ("Big Question"
    /// under "Big questions").
    static func extraTags(_ card: Flashcard) -> [String] {
        guard card.kind == .discover else { return [] }
        let category = categoryLabel(card.category)
        func stem(_ s: String) -> String {
            let lower = s.lowercased()
            return lower.hasSuffix("s") ? String(lower.dropLast()) : lower
        }
        return card.tags.filter { stem($0) != stem(category) }
    }

    /// The small line under a discover question: extra tags and reading time.
    static func discoverMeta(_ card: Flashcard) -> String? {
        guard card.kind == .discover else { return nil }
        var parts = extraTags(card)
        if let minutes = card.minutes, minutes > 0 { parts.append("\(minutes) min") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// True for a discover card with no written answer: its back lists the
    /// passages to start from instead.
    static func isOpenQuestion(_ card: Flashcard) -> Bool {
        card.kind == .discover && isBlank(card.answer)
    }

    static func revealTitle(_ card: Flashcard) -> String {
        isOpenQuestion(card) ? "Where to start" : "Show answer"
    }

    static func askTitle(_ card: Flashcard) -> String {
        card.kind == .discover ? "Talk it through with Shalom" : "Ask Shalom about this"
    }

    static func passageLabels(_ card: Flashcard) -> [String] {
        card.refs.map { ReferenceFormatter.label(for: $0) }
    }

    // MARK: VoiceOver

    /// What VoiceOver announces as the card changes or turns over (web
    /// `announcement`).
    static func announcement(for card: Flashcard, index: Int, count: Int, revealed: Bool) -> String {
        let passages = passageLabels(card).joined(separator: ", ")
        guard revealed else { return "Card \(index + 1) of \(count). \(card.question)" }
        if isOpenQuestion(card) { return "Start reading: \(passages)." }
        var lead = ""
        if card.kind == .discover, let takeaway = card.takeaway, !isBlank(takeaway) {
            lead = sentence(takeaway) + " "
        }
        return "Answer: \(lead)\(sentence(card.answer ?? "")) \(passages)."
    }

    /// Ends with a full stop unless it already ends a sentence (optionally
    /// followed by a closing quote or bracket).
    static func sentence(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var tail = Substring(trimmed)
        if let last = tail.last, "\"'\u{201D}\u{2019})".contains(last) { tail = tail.dropLast() }
        if let last = tail.last, ".!?".contains(last) { return text }
        return "\(text)."
    }

    static func isBlank(_ text: String?) -> Bool {
        (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
