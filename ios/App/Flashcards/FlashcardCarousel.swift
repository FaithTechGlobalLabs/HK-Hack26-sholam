import ShalomCore
import SwiftUI

/// The deck: glass cards in a row over the sky (native `SwipeDeck.tsx`).
/// The centred card faces you; its neighbours sit a little smaller and
/// dimmer on either side, flat and wordless, so only one card is ever read.
/// "Show answer" ("Where to start" on open discover questions) crossfades the
/// card to its milky back with Ask Shalom and Next card / Start over.
///
/// Motion is kept quiet for study: a short ease-out slide of one card (no
/// spring, no 3D turn), and an in-place crossfade between question and
/// answer. A swipe moves one card at most (`DeckSwipe`).
///
/// Ways to move: horizontal swipe, a tap on a side card, the previous/next
/// buttons, the left/right arrow keys (hardware keyboard), and VoiceOver
/// actions. Vertical drags are left to the card's own scrolling.
///
/// Reduce Motion: no side cards and no slide; cards and faces crossfade.
/// The parent gives it a new identity per deck revision (filter, focus or
/// the card IDs), so position and reveal state never carry over to a
/// different list. Independently, every position read is clamped to the
/// current cards, and a change of card IDs under the same identity resets
/// the reveal and re-clamps the position.
struct FlashcardCarousel: View {
    let cards: [Flashcard]
    let onAsk: (String) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @State private var index = 0
    @State private var revealed = false
    @State private var askedCardID: String?
    @GestureState(resetTransaction: Transaction(animation: ShalomTheme.Motion.carousel))
    private var swipe = SwipeState()
    @AccessibilityFocusState private var a11yFocus: DeckFocusTarget?
    @FocusState private var keyboardFocus: Bool

    private struct SwipeState: Equatable {
        var horizontal: Bool?
        var dx: CGFloat = 0
    }

    /// Side cards are this much smaller per card of distance: enough to read
    /// as a physical stack, not enough to look like it is moving in depth.
    private static let sideScale: Double = 0.06

    var body: some View {
        VStack(spacing: ShalomTheme.Spacing.s) {
            GeometryReader { proxy in
                stage(DeckMetrics(size: proxy.size, wide: horizontalSizeClass == .regular,
                                  largeType: dynamicTypeSize.isAccessibilitySize))
            }
            controls
        }
        .focusable()
        .focusEffectDisabled()
        .focused($keyboardFocus)
        .onKeyPress(.leftArrow) { go(current - 1); return .handled }
        .onKeyPress(.rightArrow) { go(current + 1); return .handled }
        .onAppear { keyboardFocus = true; askedCardID = nil }
        .onDisappear { askedCardID = nil }
        .onChange(of: cards.map(\.id)) { old, new in deckChanged(from: old, to: new) }
    }

    /// The stored position, clamped into the current deck. Every read during
    /// layout goes through this, so a deck that shrank under a stale index
    /// renders safely before `onChange` has run.
    private var current: Int { FlashcardDeck.clampedIndex(index, count: cards.count) ?? 0 }

    // MARK: Stage

    private func stage(_ metrics: DeckMetrics) -> some View {
        let window = visibleIndices(stride: metrics.stride)
        return ZStack {
            ForEach(window, id: \.self) { i in
                cardView(i, metrics: metrics)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .simultaneousGesture(swipeGesture(stride: metrics.stride))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Flashcards")
    }

    private func visibleIndices(stride: CGFloat) -> [Int] {
        if reduceMotion { return FlashcardDeck.window(around: index, count: cards.count, radius: 0) }
        // The drag never exceeds one card, so two cards either side cover
        // everything that can come into view.
        return FlashcardDeck.window(around: index, count: cards.count, radius: 2)
            .filter { abs(offset(of: $0, stride: stride)) <= 2.2 }
    }

    /// Card `i`'s distance from the centre, in cards, including the drag.
    private func offset(of i: Int, stride: CGFloat) -> Double {
        Double(i - current) + Double(swipe.dx / max(stride, 1))
    }

    @ViewBuilder
    private func cardView(_ i: Int, metrics: DeckMetrics) -> some View {
        let card = cards[i]
        let active = i == current
        let p = offset(of: i, stride: metrics.stride)
        let a = abs(p)
        let fade = 1 - min(a, 2) * 0.36
        // Words belong to the centred card only: gone by half a card of
        // travel, so no side card ever shows text beside the one being read.
        let words = max(0, 1 - a * 2)

        ZStack {
            if active && revealed {
                FlashcardBack(
                    card: card, position: i, count: cards.count, isLast: i == cards.count - 1,
                    askDisabled: askedCardID == card.id,
                    onNext: advance,
                    onAsk: { ask(card) },
                    a11yFocus: $a11yFocus
                )
                .transition(.opacity)
            } else {
                FlashcardFront(
                    card: card, position: i, count: cards.count, isActive: active,
                    wordsOpacity: words, onReveal: reveal, a11yFocus: $a11yFocus
                )
                .opacity(fade)
                .accessibilityHidden(!active)
                .transition(.opacity)
            }
        }
        .frame(width: metrics.cardWidth, height: metrics.cardHeight)
        // The whole card face is the tap target for centring a side card. A
        // side card's words take no touches (FlashcardFront), so the tap
        // reaches this card-level gesture instead of a no-op.
        .contentShape(RoundedRectangle(cornerRadius: ShalomTheme.Radius.card, style: .continuous))
        .scaleEffect(reduceMotion ? 1 : 1 - min(a, 1) * Self.sideScale)
        .offset(x: CGFloat(p) * metrics.stride)
        .zIndex(20 - a * 4)
        .onTapGesture { if !active { go(i) } }
        .accessibilityElement(children: .contain)
        .accessibilityAction(named: "Next card") { go(current + 1) }
        .accessibilityAction(named: "Previous card") { go(current - 1) }
        .transition(.opacity)
    }

    // MARK: Position row

    private var controls: some View {
        HStack(spacing: ShalomTheme.Spacing.xxs) {
            Button { go(current - 1) } label: {
                Image(systemName: "chevron.left")
                    .font(.body.weight(.semibold))
                    .frame(minWidth: ShalomTheme.Size.minTarget, minHeight: ShalomTheme.Size.minTarget)
                    .contentShape(Rectangle())
            }
            .disabled(current == 0)
            .opacity(current == 0 ? 0.4 : 1)
            .accessibilityLabel("Previous card")

            Text("\(current + 1) of \(cards.count)")
                .font(.subheadline.monospacedDigit())
                .frame(minWidth: 96)
                .accessibilityLabel("Card \(current + 1) of \(cards.count)")

            Button { go(current + 1) } label: {
                Image(systemName: "chevron.right")
                    .font(.body.weight(.semibold))
                    .frame(minWidth: ShalomTheme.Size.minTarget, minHeight: ShalomTheme.Size.minTarget)
                    .contentShape(Rectangle())
            }
            .disabled(current >= cards.count - 1)
            .opacity(current >= cards.count - 1 ? 0.4 : 1)
            .accessibilityLabel("Next card")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
        .padding(.horizontal, ShalomTheme.Spacing.xxs)
        .background { GlassBackground(cornerRadius: 26) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Card position")
    }

    // MARK: Gestures

    private func swipeGesture(stride: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 10)
            .updating($swipe) { value, state, transaction in
                let t = value.translation
                if state.horizontal == nil { state.horizontal = abs(t.width) > abs(t.height) }
                guard state.horizontal == true else { return }
                transaction.animation = nil
                state.dx = shownDrag(t.width, stride: stride)
            }
            .onEnded { value in
                let t = value.translation
                // Same axis rule as the start of the drag: mostly vertical
                // drags belong to the card's scroll view.
                guard abs(t.width) > abs(t.height) else { return }
                let step = DeckSwipe.step(
                    travelled: shownDrag(t.width, stride: stride),
                    flick: value.predictedEndTranslation.width,
                    stride: stride)
                if step != 0 { go(current + step) }
            }
    }

    private func shownDrag(_ dx: CGFloat, stride: CGFloat) -> CGFloat {
        DeckSwipe.drag(dx, stride: stride, atFirst: current == 0, atLast: current == cards.count - 1)
    }

    // MARK: Actions

    private func go(_ target: Int) {
        guard !cards.isEmpty else { return }
        guard let next = FlashcardDeck.clampedIndex(target, count: cards.count),
              next != current else { return }
        // The card leaving the centre shows its front at once; only the
        // carousel move animates.
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) { revealed = false }
        withAnimation(reduceMotion ? ShalomTheme.Motion.crossfade : ShalomTheme.Motion.carousel) {
            index = next
        }
        a11yFocus = .question
    }

    /// Next card, or Start over from the last card. A one-card deck goes
    /// back to its question, so the button is never a dead control.
    private func advance() {
        if current < cards.count - 1 {
            go(current + 1)
        } else if current > 0 {
            go(0)
        } else {
            withAnimation(ShalomTheme.Motion.reveal) { revealed = false }
            a11yFocus = .question
        }
    }

    private func reveal() {
        guard !revealed, !cards.isEmpty else { return }
        withAnimation(ShalomTheme.Motion.reveal) { revealed = true }
        a11yFocus = .answer
    }

    /// The deck's cards changed under the same view (a refresh). The centred
    /// card stays centred if it is still there; otherwise the position is
    /// clamped. Either way the card shows its question again.
    private func deckChanged(from old: [String], to new: [String]) {
        let centred = old.indices.contains(index) ? old[index] : nil
        let target = centred.flatMap { new.firstIndex(of: $0) } ?? index
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            index = FlashcardDeck.clampedIndex(target, count: new.count) ?? 0
            revealed = false
        }
        if let askedCardID, !new.contains(askedCardID) { self.askedCardID = nil }
    }

    /// Only ever called from the Ask button: one request per tap, never on
    /// appear, swipe or reveal. Repeat taps on the same card are ignored
    /// until the deck is shown again.
    private func ask(_ card: Flashcard) {
        guard askedCardID != card.id else { return }
        askedCardID = card.id
        onAsk(FlashcardDeck.chatRequest(for: card))
    }
}

/// Card size from the space available, never from device dimensions.
private struct DeckMetrics {
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    let stride: CGFloat

    init(size: CGSize, wide: Bool, largeType: Bool) {
        let maxWidth: CGFloat = wide ? 460 : 400
        let available = max(0, size.width - 32)
        let preferred = largeType ? maxWidth : min(maxWidth, max(264, size.width * 0.78))
        cardWidth = max(0, min(available, preferred))
        let maxHeight: CGFloat = (wide || largeType) ? 600 : 460
        cardHeight = max(0, min(size.height, maxHeight))
        stride = max(1, cardWidth * 1.06)
    }
}
