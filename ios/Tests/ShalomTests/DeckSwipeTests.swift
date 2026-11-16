// App-target unit tests for ios/App/Flashcards/DeckSwipe.swift.
// NOT RUN: source-only stage, no xcodebuild/swift test.
import CoreGraphics
import Testing
@testable import Shalom

@Suite("Deck swipe: one card per swipe")
struct DeckSwipeTests {
    private let stride: CGFloat = 300

    @Test func shortDragWithoutFlickStays() {
        #expect(DeckSwipe.step(travelled: 40, flick: 100, stride: stride) == 0)
        #expect(DeckSwipe.step(travelled: -40, flick: -100, stride: stride) == 0)
    }

    @Test func dragPastThresholdMovesOne() {
        #expect(DeckSwipe.step(travelled: -61, flick: 0, stride: stride) == 1)
        #expect(DeckSwipe.step(travelled: 61, flick: 0, stride: stride) == -1)
    }

    @Test func flickMovesOne() {
        #expect(DeckSwipe.step(travelled: -10, flick: -151, stride: stride) == 1)
        #expect(DeckSwipe.step(travelled: 10, flick: 151, stride: stride) == -1)
    }

    @Test func strongSwipeNeverMovesMoreThanOne() {
        #expect(DeckSwipe.step(travelled: -stride, flick: -stride * 8, stride: stride) == 1)
        #expect(DeckSwipe.step(travelled: stride, flick: stride * 8, stride: stride) == -1)
        #expect(DeckSwipe.step(travelled: 0, flick: -10_000, stride: stride) == 1)
    }

    @Test func dragIsLimitedToOneCard() {
        #expect(DeckSwipe.drag(-900, stride: stride, atFirst: false, atLast: false) == -stride)
        #expect(DeckSwipe.drag(900, stride: stride, atFirst: false, atLast: false) == stride)
        #expect(DeckSwipe.drag(120, stride: stride, atFirst: false, atLast: false) == 120)
    }

    @Test func dragResistsPastTheEnds() {
        #expect(abs(DeckSwipe.drag(100, stride: stride, atFirst: true, atLast: false) - 30) < 0.001)
        #expect(abs(DeckSwipe.drag(-100, stride: stride, atFirst: false, atLast: true) + 30) < 0.001)
        // Towards the rest of the deck there is no resistance.
        #expect(DeckSwipe.drag(-100, stride: stride, atFirst: true, atLast: false) == -100)
    }

    @Test func degenerateStrideIsSafe() {
        #expect(DeckSwipe.step(travelled: 5, flick: 0, stride: 0) == -1)
        #expect(DeckSwipe.drag(50, stride: 0, atFirst: false, atLast: false) == 1)
    }
}
