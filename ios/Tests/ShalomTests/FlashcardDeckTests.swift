// Proposed app-target unit tests for ios/App/Flashcards/FlashcardDeck.swift.
// Authored as scratch because this writer owns no test path; the lead can move
// it into an app unit-test target (needs `@testable import Shalom`).
// NOT RUN: source-only stage, no xcodebuild/swift test.
import ShalomCore
import Testing
@testable import Shalom

private func card(_ id: String, _ kind: CardKind = .fact, answer: String? = "A",
                  takeaway: String? = nil, tags: [String] = [], minutes: Int? = nil,
                  category: String = "jesus", refs: [String] = ["JHN.11.35"]) -> Flashcard {
    Flashcard(id: id, kind: kind, question: "Q \(id)?", answer: answer, takeaway: takeaway,
              refs: refs, category: category, tags: tags, minutes: minutes)
}

private struct FixedGenerator: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}

@Suite struct FlashcardDeckTests {
    let cards = [card("f1"), card("d1", .discover), card("f2"), card("d2", .discover), card("f3")]

    @Test func shuffleIsAPermutation() {
        var generator = FixedGenerator(state: 7)
        let order = FlashcardDeck.shuffledOrder(of: cards, using: &generator)
        #expect(order.sorted() == cards.map(\.id).sorted())
    }

    @Test func filtersKeepTheVisitOrder() {
        let order = ["f3", "d2", "f1", "d1", "f2"]
        let all = FlashcardDeck.view(order: order, cards: cards, filter: .all, focusID: nil)
        #expect(all.map(\.id) == order)
        let facts = FlashcardDeck.view(order: order, cards: cards, filter: .fact, focusID: nil)
        #expect(facts.map(\.id) == ["f3", "f1", "f2"])
        let discover = FlashcardDeck.view(order: order, cards: cards, filter: .discover, focusID: nil)
        #expect(discover.map(\.id) == ["d2", "d1"])
    }

    @Test func focusPromotesWithoutReshuffling() {
        let order = ["f3", "d2", "f1", "d1", "f2"]
        let focused = FlashcardDeck.view(order: order, cards: cards, filter: .all, focusID: "d1")
        #expect(focused.map(\.id) == ["d1", "f3", "d2", "f1", "f2"])
        // A focus outside the filter changes nothing.
        let facts = FlashcardDeck.view(order: order, cards: cards, filter: .fact, focusID: "d1")
        #expect(facts.map(\.id) == ["f3", "f1", "f2"])
        // An unknown focus changes nothing.
        let unknown = FlashcardDeck.view(order: order, cards: cards, filter: .all, focusID: "zz")
        #expect(unknown.map(\.id) == order)
    }

    @Test func reshuffleOnlyForADifferentDeck() {
        let order = Array(cards.map(\.id).reversed())
        #expect(!FlashcardDeck.needsReshuffle(order: order, cards: cards))
        var edited = cards
        edited[0].answer = "Edited upstream"
        #expect(!FlashcardDeck.needsReshuffle(order: order, cards: edited))
        #expect(FlashcardDeck.needsReshuffle(order: order, cards: cards + [card("f4")]))
        #expect(FlashcardDeck.needsReshuffle(order: order, cards: Array(cards.dropLast())))
    }

    @Test func viewShowsCurrentContentAndUnorderedCards() {
        var edited = cards
        edited[0].answer = "New"
        let view = FlashcardDeck.view(order: ["f1"], cards: edited, filter: .all, focusID: nil)
        #expect(view.first?.answer == "New")
        #expect(view.count == cards.count)
    }

    @Test func chatRequestMatchesTheWeb() {
        let label = ReferenceFormatter.label(for: "JHN.11.35")
        #expect(FlashcardDeck.chatRequest(for: card("f1"))
                == "Give a profound explanation of \(label), in answer to: Q f1?")
        let discover = card("d1", .discover, refs: ["JHN.11.35", "JHN.11.35"])
        #expect(FlashcardDeck.chatRequest(for: discover)
                == "Help me explore this question: Q d1? Start from \(label) and \(label).")
    }

    @Test func revealTitles() {
        #expect(FlashcardDeck.revealTitle(card("f1")) == "Show answer")
        #expect(FlashcardDeck.revealTitle(card("d1", .discover)) == "Show answer")
        #expect(FlashcardDeck.revealTitle(card("d2", .discover, answer: nil)) == "Where to start")
        #expect(FlashcardDeck.revealTitle(card("d3", .discover, answer: "  ")) == "Where to start")
    }

    @Test func askTitlesAreDirectActionsForBothKinds() {
        #expect(FlashcardDeck.askTitle(card("f1")) == "Ask Shalom")
        #expect(FlashcardDeck.askTitle(card("d1", .discover)) == "Ask Shalom")
    }

    @Test func sentenceEndings() {
        #expect(FlashcardDeck.sentence("Jesus wept") == "Jesus wept.")
        #expect(FlashcardDeck.sentence("Jesus wept.") == "Jesus wept.")
        #expect(FlashcardDeck.sentence("\"Jesus wept.\"") == "\"Jesus wept.\"")
        #expect(FlashcardDeck.sentence("Really?") == "Really?")
    }

    @Test func announcements() {
        let label = ReferenceFormatter.label(for: "JHN.11.35")
        let fact = card("f1", answer: "Jesus wept")
        #expect(FlashcardDeck.announcement(for: fact, index: 0, count: 5, revealed: false)
                == "Card 1 of 5. Q f1?")
        #expect(FlashcardDeck.announcement(for: fact, index: 0, count: 5, revealed: true)
                == "Answer: Jesus wept. \(label).")
        let open = card("d1", .discover, answer: nil)
        #expect(FlashcardDeck.announcement(for: open, index: 1, count: 5, revealed: true)
                == "Start reading: \(label).")
        let written = card("d2", .discover, answer: "Yes", takeaway: "Be humble")
        #expect(FlashcardDeck.announcement(for: written, index: 1, count: 5, revealed: true)
                == "Answer: Be humble. Yes. \(label).")
    }

    @Test func discoverMetaDropsTagsRepeatingTheCategory() {
        let c = card("d1", .discover, tags: ["Big Question", "Curious"], minutes: 3,
                     category: "big-questions")
        #expect(FlashcardDeck.extraTags(c) == ["Curious"])
        #expect(FlashcardDeck.discoverMeta(c) == "Curious · 3 min")
        #expect(FlashcardDeck.discoverMeta(card("f1")) == nil)
    }

    @Test func clampedIndexStaysInsideTheDeck() {
        #expect(FlashcardDeck.clampedIndex(0, count: 0) == nil)
        #expect(FlashcardDeck.clampedIndex(4, count: 0) == nil)
        #expect(FlashcardDeck.clampedIndex(-2, count: 3) == 0)
        #expect(FlashcardDeck.clampedIndex(1, count: 3) == 1)
        // A deck that shrank under a stale position lands on its last card.
        #expect(FlashcardDeck.clampedIndex(9, count: 3) == 2)
    }

    @Test func windowIsNeverAnInvertedRange() {
        #expect(FlashcardDeck.window(around: 0, count: 0, radius: 3) == [])
        #expect(FlashcardDeck.window(around: 5, count: 0, radius: 3) == [])
        #expect(FlashcardDeck.window(around: 0, count: 1, radius: 3) == [0])
        #expect(FlashcardDeck.window(around: 4, count: 10, radius: 3) == [1, 2, 3, 4, 5, 6, 7])
        #expect(FlashcardDeck.window(around: 0, count: 10, radius: 3) == [0, 1, 2, 3])
        // Stale index after the deck shrank from 10 cards to 2.
        #expect(FlashcardDeck.window(around: 9, count: 2, radius: 3) == [0, 1])
        #expect(FlashcardDeck.window(around: 9, count: 2, radius: 0) == [1])
        #expect(FlashcardDeck.window(around: -4, count: 5, radius: 1) == [0, 1])
        #expect(FlashcardDeck.window(around: 2, count: 5, radius: -1) == [2])
        #expect(FlashcardDeck.window(around: 2, count: 5, radius: .max) == [0, 1, 2, 3, 4])
    }

    @Test func categoryLabels() {
        #expect(FlashcardDeck.categoryLabel("life-identity") == "Everyday life & identity")
        #expect(FlashcardDeck.categoryLabel("new-slug") == "New slug")
    }
}
