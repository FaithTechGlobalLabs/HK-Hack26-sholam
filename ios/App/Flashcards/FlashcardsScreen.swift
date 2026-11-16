import ShalomCore
import SwiftUI

/// Flashcards: one card at a time with a switch between the two kinds of
/// card (native `FlashcardsView.tsx`). The deck is shuffled once per visit,
/// that is once per lifetime of this view's identity, and again only when a
/// different set of cards arrives. Filters and the chat focus reorder that
/// same shuffle and never reshuffle.
///
/// The screen draws no sky of its own; place it over `SkyBackground()`.
/// `onAsk` receives the chat request text only when the person taps Ask
/// Shalom on a card; nothing here sends a chat message by itself.
struct FlashcardsScreen: View {
    let cards: [Flashcard]
    let isOffline: Bool
    let focusedCardID: String?
    /// Additive to the frozen interface (defaults to false): true while the
    /// first deck is still being fetched, so loading never reads as empty.
    let isLoading: Bool
    let onAsk: (String) -> Void

    @State private var order: [String]
    @State private var filter: DeckFilter = .all
    @State private var focusID: String?

    init(cards: [Flashcard], isOffline: Bool, focusedCardID: String?,
         isLoading: Bool = false, onAsk: @escaping (String) -> Void) {
        self.cards = cards
        self.isOffline = isOffline
        self.focusedCardID = focusedCardID
        self.isLoading = isLoading
        self.onAsk = onAsk
        _order = State(initialValue: FlashcardDeck.shuffledOrder(of: cards))
        _focusID = State(initialValue: focusedCardID.flatMap { id in
            cards.contains { $0.id == id } ? id : nil
        })
    }

    private var deck: [Flashcard] {
        FlashcardDeck.view(order: order, cards: cards, filter: filter, focusID: focusID)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
                .frame(maxWidth: ShalomTheme.Size.readableWidth, alignment: .leading)
                .padding(.horizontal, ShalomTheme.Spacing.m)
                .padding(.top, ShalomTheme.Spacing.xs)
                .frame(maxWidth: .infinity)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.vertical, ShalomTheme.Spacing.s)
        }
        .foregroundStyle(ShalomTheme.onSky)
        .onChange(of: cards.map(\.id)) { _, _ in
            if FlashcardDeck.needsReshuffle(order: order, cards: cards) {
                order = FlashcardDeck.shuffledOrder(of: cards)
            }
            if let focusID, !cards.contains(where: { $0.id == focusID }) { self.focusID = nil }
            if focusID == nil, let wanted = focusedCardID, cards.contains(where: { $0.id == wanted }) {
                focusID = wanted
            }
        }
        .onChange(of: focusedCardID) { _, wanted in
            // A new link from chat promotes that card; it does not reshuffle.
            if let wanted, cards.contains(where: { $0.id == wanted }) { focusID = wanted }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: ShalomTheme.Spacing.s) {
            // The title belongs to the navigation bar (RootView); the screen
            // shows only the deck's own status.
            if isOffline { OfflineBadge() }

            if !cards.isEmpty { filterRow }

            if focusID != nil {
                HStack(spacing: ShalomTheme.Spacing.xs) {
                    Text("From Shalom Guide")
                        .font(.subheadline)
                        .foregroundStyle(ShalomTheme.onSkyMuted)
                    Spacer(minLength: 0)
                    Button {
                        focusID = nil
                    } label: {
                        Label("Show the full deck", systemImage: "xmark")
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, ShalomTheme.Spacing.s)
                            .frame(minHeight: ShalomTheme.Size.minTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.highlight)
                }
            }
        }
    }

    private var filterRow: some View {
        ViewThatFits(in: .horizontal) {
            filterButtons
            ScrollView(.horizontal, showsIndicators: false) { filterButtons }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Which cards")
    }

    private var filterButtons: some View {
        HStack(spacing: ShalomTheme.Spacing.xs) {
            ForEach(DeckFilter.allCases) { option in
                let selected = option == filter
                Button {
                    filter = option
                } label: {
                    Text(option.label)
                        .font(.subheadline.weight(selected ? .semibold : .medium))
                        .lineLimit(1)
                        .padding(.horizontal, ShalomTheme.Spacing.m)
                        .frame(minHeight: ShalomTheme.Size.minTarget)
                        .foregroundStyle(selected ? ShalomTheme.skyInk : ShalomTheme.onSky)
                        .background {
                            if selected {
                                Capsule().fill(.white.opacity(0.94))
                            } else {
                                GlassBackground(cornerRadius: ShalomTheme.Radius.chip)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .hoverEffect(.highlight)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        let deck = self.deck
        if cards.isEmpty && isLoading {
            DeckMessage(
                title: "Loading cards…",
                detail: nil,
                showsProgress: true
            )
        } else if cards.isEmpty {
            DeckMessage(
                title: "No cards yet",
                detail: isOffline
                    ? "You're offline and no cards are saved on this device yet. They will appear once you're back online."
                    : "The deck is empty right now. You can still ask about the Bible in Chat.",
                showsProgress: false
            )
        } else if deck.isEmpty {
            DeckMessage(
                title: "Nothing under \(filter.label) yet",
                detail: "The other cards are still here.",
                showsProgress: false,
                action: ("Show all cards", { filter = .all })
            )
        } else {
            // A new identity per deck revision: the filter, the focus and
            // the exact card IDs in order. A refreshed deck with different
            // cards remounts the carousel in the same update, so position
            // and flip state never outlive the list they belonged to.
            FlashcardCarousel(cards: deck, onAsk: onAsk)
                .id(DeckRevision(filter: filter, focusID: focusID, cardIDs: deck.map(\.id)))
                .transition(.opacity)
        }
    }
}

/// The carousel's identity (see `content`). Content edits under the same
/// IDs keep it, so they never reset the visit.
private struct DeckRevision: Hashable {
    let filter: DeckFilter
    let focusID: String?
    let cardIDs: [String]
}

/// "Offline" status for a deck served from the on-device cache.
private struct OfflineBadge: View {
    var body: some View {
        Label("Offline · saved cards", systemImage: "wifi.slash")
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, ShalomTheme.Spacing.s)
            .padding(.vertical, ShalomTheme.Spacing.xxs)
            .frame(minHeight: 32)
            .background { GlassBackground(cornerRadius: 16, emphasis: true) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Offline. Showing cards saved on this device.")
    }
}

/// Loading, empty and empty-filter states: a glass panel the size of a card
/// region, never a disabled deck.
private struct DeckMessage: View {
    let title: String
    let detail: String?
    let showsProgress: Bool
    var action: (label: String, perform: () -> Void)?

    var body: some View {
        VStack(spacing: ShalomTheme.Spacing.s) {
            if showsProgress {
                ProgressView().tint(.white).accessibilityHidden(true)
            }
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(ShalomTheme.onSkyMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let action {
                Button(action.label, action: action.perform)
                    .buttonStyle(CardSolidButtonStyle(
                        fill: .white, pressedFill: Color(rgb: 0xEAF1FF), text: ShalomTheme.skyInk))
                    .padding(.top, ShalomTheme.Spacing.xs)
            }
        }
        .padding(ShalomTheme.Spacing.l)
        .frame(maxWidth: 400)
        .background { GlassBackground(cornerRadius: ShalomTheme.Radius.card, emphasis: true) }
        .padding(.horizontal, ShalomTheme.Spacing.m)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Previews

#if DEBUG
/// PREVIEW SAMPLE ONLY. Copied verbatim from the repository's bundled card
/// data (`data/flashcards.seed.json` and `data/faithmap.cards.json`) so the
/// canvas shows real content; the app itself shows whatever the deck API or
/// cache returns.
enum FlashcardPreviewSamples {
    static let cards: [Flashcard] = [
        Flashcard(
            id: "seed-shortest-verse",
            question: "What is the shortest verse in most English Bibles?",
            answer: "\"Jesus wept.\"",
            explanation: "At the tomb of His friend Lazarus, Jesus wept, even though He was about to raise him from the dead.",
            refs: ["JHN.11.35"], category: "jesus", tone: "fun", difficulty: 1),
        Flashcard(
            id: "seed-methuselah",
            question: "Who is the oldest person recorded in the Bible, and how old was he?",
            answer: "Methuselah, who lived 969 years.",
            refs: ["GEN.5.27"], category: "people", tone: "fact", difficulty: 1),
        Flashcard(
            id: "faithmap-is-it-possible-to-be-confident-without-becoming-arrogant",
            kind: .discover,
            question: "Is it possible to be confident without becoming arrogant?",
            answer: "Yes. Confidence means recognizing your abilities and worth; arrogance means treating those abilities as proof that you are above other people. You can take pride in doing something well and still remain humble.",
            explanation: "Philippians 2 points to Jesus as the model: although he had status, he chose the position of a servant. Paul is not asking Christians to pretend they have no gifts. Romans 12:3 says to think of yourself with honest judgment, neither exaggerating nor denying what you have been given. The Pharisee in Luke 18 shows the opposite problem: he builds his identity by looking down on someone else.",
            takeaway: "Know what you are good at without using it to look down on others.",
            refs: ["PHP.2.3-PHP.2.8", "LUK.18.9-LUK.18.14", "ROM.12.3"],
            category: "life-identity", tags: ["Real Life", "Curious"], minutes: 3,
            source: "faithmap-132", section: "Everyday Life, Social Media & Identity", difficulty: 2),
    ]
}

private struct FlashcardsPreviewHost: View {
    var cards = FlashcardPreviewSamples.cards
    var isOffline = false
    var focusedCardID: String?
    var isLoading = false

    var body: some View {
        FlashcardsScreen(cards: cards, isOffline: isOffline, focusedCardID: focusedCardID,
                         isLoading: isLoading) { request in
            print("Preview Ask Shalom (not sent):", request)
        }
        .background { SkyBackground() }
    }
}

#Preview("Sample deck") { FlashcardsPreviewHost() }

#Preview("Sample deck, offline, linked from chat") {
    FlashcardsPreviewHost(isOffline: true,
                          focusedCardID: "faithmap-is-it-possible-to-be-confident-without-becoming-arrogant")
}

#Preview("Sample deck, accessibility type size") {
    FlashcardsPreviewHost().environment(\.dynamicTypeSize, .accessibility3)
}

#Preview("Loading") { FlashcardsPreviewHost(cards: [], isLoading: true) }

#Preview("Empty, offline") { FlashcardsPreviewHost(cards: [], isOffline: true) }
#endif
