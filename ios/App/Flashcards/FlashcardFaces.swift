import ShalomCore
import SwiftUI

/// Where VoiceOver focus goes as the deck changes.
enum DeckFocusTarget: Hashable {
    case question, answer
}

// MARK: - Front

/// The question on deep blue glass, dark enough that white type holds over a
/// white cloud. Content scrolls at large Dynamic Type; the reveal action
/// stays on the card (pinned below, or at the end of the scroll at
/// accessibility sizes).
///
/// Only the active card takes touches and VoiceOver focus. A side card's
/// words never consume a tap, so the carousel's card-level tap centres it.
struct FlashcardFront: View {
    let card: Flashcard
    let position: Int
    let count: Int
    let isActive: Bool
    /// The words fade on side cards (web `placement().words`).
    let wordsOpacity: Double
    let onReveal: () -> Void
    var a11yFocus: AccessibilityFocusState<DeckFocusTarget?>.Binding

    var body: some View {
        CardScrollLayout {
            VStack(alignment: .leading, spacing: ShalomTheme.Spacing.s) {
                Text("\(Text(FlashcardDeck.kindLabel(card)).fontWeight(.semibold)) · \(FlashcardDeck.categoryLabel(card.category))")
                    .font(.footnote)
                    .accessibilityHidden(!isActive)
                Text(card.question)
                    .font(card.question.count > 70
                          ? .title3.weight(.semibold) : .title2.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel(FlashcardDeck.announcement(
                        for: card, index: position, count: count, revealed: false))
                    .accessibilityAddTraits(.isHeader)
                    .modifier(DeckFocus(isActive: isActive, binding: a11yFocus, target: .question))
                if let meta = FlashcardDeck.discoverMeta(card) {
                    Text(meta).font(.subheadline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // A tap on the question is a shortcut; the button is the
            // accessible way to turn the card. Only reached when active.
            .contentShape(Rectangle())
            .onTapGesture { if isActive { onReveal() } }
            .opacity(wordsOpacity)
        } actions: {
            if isActive {
                Button(FlashcardDeck.revealTitle(card), action: onReveal)
                    .buttonStyle(CardSolidButtonStyle(
                        fill: .white, pressedFill: Color(rgb: 0xEAF1FF), text: ShalomTheme.skyInk))
                    .accessibilityIdentifier("card-face-reveal")
                    .padding(.horizontal, ShalomTheme.Spacing.l)
                    .padding(.top, ShalomTheme.Spacing.m)
            }
        }
        // Side cards: no scrolling or tapping inside, so a tap anywhere on
        // the card falls through to the carousel and centres it.
        .allowsHitTesting(isActive)
        .padding(.vertical, ShalomTheme.Spacing.l)
        .foregroundStyle(.white)
        .background { FrontGlass(cornerRadius: ShalomTheme.Radius.card) }
        .clipShape(RoundedRectangle(cornerRadius: ShalomTheme.Radius.card, style: .continuous))
    }
}

/// Deep blue glass for the card front (sky.css `.flashcard-front`).
private struct FrontGlass: View {
    let cornerRadius: CGFloat
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if reduceTransparency {
            shape
                .fill(LinearGradient(colors: [Color(rgb: 0x1A3E96), Color(rgb: 0x2554AE)],
                                     startPoint: .top, endPoint: .bottom))
                .overlay { shape.strokeBorder(.white.opacity(0.3), lineWidth: 1) }
        } else {
            let boost = contrast == .increased ? 0.15 : 0
            shape
                .fill(.ultraThinMaterial)
                .environment(\.colorScheme, .light)
                .overlay {
                    shape.fill(LinearGradient(stops: [
                        // The lower half stays dense too: long questions at
                        // accessibility sizes run down over white cloud.
                        .init(color: Color(rgb: 0x1A3E96).opacity(min(1, 0.94 + boost)), location: 0),
                        .init(color: Color(rgb: 0x1E46A0).opacity(min(1, 0.92 + boost)), location: 0.45),
                        .init(color: Color(rgb: 0x285ABE).opacity(min(1, 0.9 + boost)), location: 1),
                    ], startPoint: .top, endPoint: .bottom))
                }
                .overlay {
                    // Light resting low at the far corner, away from the words.
                    shape.fill(RadialGradient(
                        colors: [.white.opacity(0.04), .white.opacity(0.01), .clear],
                        center: UnitPoint(x: 0.85, y: 1), startRadius: 0, endRadius: 320))
                }
                .overlay {
                    shape.strokeBorder(
                        LinearGradient(colors: [.white.opacity(0.5), .white.opacity(0.18)],
                                       startPoint: .top, endPoint: .bottom),
                        lineWidth: 1)
                }
        }
    }
}

// MARK: - Back

/// The answer on milky paper (sky.css `.flashcard-back`), with every part the
/// card carries: the takeaway, the answer, the passages, the explanation.
/// Ask Shalom and Next card / Start over stay on the card (pinned below, or
/// at the end of the scroll at accessibility sizes). Only built for the
/// active card, so it always takes the answer's VoiceOver focus.
struct FlashcardBack: View {
    let card: Flashcard
    let position: Int
    let count: Int
    let isLast: Bool
    let askDisabled: Bool
    let onNext: () -> Void
    let onAsk: () -> Void
    var a11yFocus: AccessibilityFocusState<DeckFocusTarget?>.Binding

    private var palette: CardPalette { card.kind == .discover ? .discover : .fact }
    private var passages: [String] { FlashcardDeck.passageLabels(card) }

    var body: some View {
        CardScrollLayout {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(Text(FlashcardDeck.kindLabel(card)).fontWeight(.semibold).foregroundStyle(palette.accent))\(Text(" · \(FlashcardDeck.categoryLabel(card.category))").foregroundStyle(palette.muted))")
                    .font(.footnote)
                Text(card.question)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, ShalomTheme.Spacing.xs)
                Rectangle()
                    .fill(palette.rule)
                    .frame(height: 1)
                    .padding(.vertical, ShalomTheme.Spacing.s)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ShalomTheme.Spacing.xs) {
                    // One VoiceOver element that reads exactly what the deck
                    // announces on reveal; the notes after it read on their own.
                    answerContent
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(FlashcardDeck.announcement(
                            for: card, index: position, count: count, revealed: true))
                        .accessibilityFocused(a11yFocus, equals: .answer)
                    notes
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } actions: {
            VStack(spacing: ShalomTheme.Spacing.xs) {
                Button(FlashcardDeck.askTitle(card), action: onAsk)
                    .buttonStyle(CardQuietButtonStyle(color: palette.accent, pressed: palette.rule))
                    .disabled(askDisabled)
                    .accessibilityIdentifier("card-face-ask")
                Button(isLast ? "Start over" : "Next card", action: onNext)
                    .buttonStyle(CardSolidButtonStyle(
                        fill: palette.primary, pressedFill: palette.primaryPressed, text: .white))
                    .accessibilityIdentifier("card-face-next")
            }
            .padding(.horizontal, ShalomTheme.Spacing.l)
            .padding(.top, ShalomTheme.Spacing.s)
        }
        .padding(.vertical, ShalomTheme.Spacing.l)
        .foregroundStyle(palette.ink)
        .background { PaperGlass(paper: palette.paper, cornerRadius: ShalomTheme.Radius.card) }
        .clipShape(RoundedRectangle(cornerRadius: ShalomTheme.Radius.card, style: .continuous))
    }

    /// The answer itself, as announced: the takeaway, the answer and the
    /// passages, or the passages to start from for an open question.
    @ViewBuilder private var answerContent: some View {
        if FlashcardDeck.isOpenQuestion(card) {
            VStack(alignment: .leading, spacing: ShalomTheme.Spacing.xs) {
                Text("Start reading")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(palette.accent)
                ForEach(Array(passages.enumerated()), id: \.offset) { _, label in
                    Text(label).font(.title3.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        } else if card.kind == .discover {
            // The team's written answer: the takeaway leads, then the answer
            // and the passages.
            VStack(alignment: .leading, spacing: ShalomTheme.Spacing.xs) {
                if let takeaway = card.takeaway, !FlashcardDeck.isBlank(takeaway) {
                    Text(takeaway).font(.title3.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(card.answer ?? "").font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                passageLine
            }
        } else {
            VStack(alignment: .leading, spacing: ShalomTheme.Spacing.xs) {
                Text(card.answer ?? "")
                    .font((card.answer?.count ?? 0) > 60
                          ? .title3.weight(.semibold) : .title2.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                passageLine
            }
        }
    }

    /// What follows the answer: why the passage matters, the explanation, or
    /// the note that an open question has no single answer.
    @ViewBuilder private var notes: some View {
        if FlashcardDeck.isOpenQuestion(card) {
            Text("An open question, so there is no single answer.")
                .font(.body).foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        } else if let explanation = card.explanation, !FlashcardDeck.isBlank(explanation) {
            if card.kind == .discover {
                VStack(alignment: .leading, spacing: ShalomTheme.Spacing.xs) {
                    Text("Why this passage matters")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(palette.accent)
                    Text(explanation).font(.subheadline).foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, ShalomTheme.Spacing.s)
                .accessibilityElement(children: .combine)
            } else {
                Text(explanation).font(.subheadline).foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var passageLine: some View {
        Text(passages.joined(separator: " · "))
            .font(.subheadline.weight(.medium))
            .foregroundStyle(palette.accent)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Milky paper glass: mostly opaque so long answers read like print, with a
/// little of the sky showing through.
private struct PaperGlass: View {
    let paper: Color
    let cornerRadius: CGFloat
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if reduceTransparency {
            shape.fill(paper)
        } else {
            shape
                .fill(.ultraThinMaterial)
                .environment(\.colorScheme, .light)
                .overlay {
                    shape.fill(LinearGradient(colors: [paper.opacity(0.92), paper.opacity(0.86)],
                                              startPoint: .topLeading, endPoint: .bottomTrailing))
                }
                .overlay { shape.strokeBorder(.white.opacity(0.4), lineWidth: 1) }
        }
    }
}

/// A card face's scrolling content and its actions. No fade masks the text:
/// content that fits shows whole, and longer content scrolls with the
/// system indicator, which flashes on appear so the overflow is visible.
/// The scroll view spans the card's full width so the indicator sits at the
/// card edge, clear of the words.
///
/// At standard sizes the actions stay pinned below the scroll. At
/// accessibility sizes they scroll after the content instead, so tall,
/// wrapped buttons can never push themselves off the card.
///
/// The content gets the card's horizontal padding here; the actions bring
/// their own padding (so an absent action takes no space).
private struct CardScrollLayout<Content: View, Actions: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private let content: Content
    private let actions: Actions

    init(@ViewBuilder content: () -> Content, @ViewBuilder actions: () -> Actions) {
        self.content = content()
        self.actions = actions()
    }

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            scrolling(VStack(spacing: 0) {
                padded
                actions
            })
        } else {
            VStack(spacing: 0) {
                scrolling(padded)
                actions
            }
        }
    }

    private var padded: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, ShalomTheme.Spacing.l)
    }

    private func scrolling(_ inner: some View) -> some View {
        ScrollView(.vertical) { inner }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.automatic)
            .scrollIndicatorsFlash(onAppear: true)
    }
}

/// VoiceOver focus binds only on the active card, so moving focus to the
/// question can never land on a side card.
private struct DeckFocus: ViewModifier {
    let isActive: Bool
    let binding: AccessibilityFocusState<DeckFocusTarget?>.Binding
    let target: DeckFocusTarget

    @ViewBuilder func body(content: Content) -> some View {
        if isActive {
            content.accessibilityFocused(binding, equals: target)
        } else {
            content
        }
    }
}

// MARK: - Buttons

/// A full-width card action, at least 50 pt tall; the label wraps rather
/// than truncating at large Dynamic Type.
struct CardSolidButtonStyle: ButtonStyle {
    let fill: Color
    let pressedFill: Color
    let text: Color

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: ShalomTheme.Radius.button, style: .continuous)
        configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.center)
            .foregroundStyle(text)
            .padding(.horizontal, ShalomTheme.Spacing.m)
            .padding(.vertical, ShalomTheme.Spacing.xs)
            .frame(maxWidth: .infinity, minHeight: ShalomTheme.Size.primaryButton)
            .background { shape.fill(configuration.isPressed ? pressedFill : fill) }
            .contentShape(shape)
            .hoverEffect(.highlight)
            .offset(y: configuration.isPressed ? 1 : 0)
    }
}

/// The quiet text action (Ask Shalom), leading-aligned, 44 pt tall.
struct CardQuietButtonStyle: ButtonStyle {
    let color: Color
    let pressed: Color
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.leading)
            .foregroundStyle(color.opacity(isEnabled ? 1 : 0.5))
            .padding(.horizontal, ShalomTheme.Spacing.s)
            .padding(.vertical, ShalomTheme.Spacing.xxs)
            .frame(minHeight: ShalomTheme.Size.minTarget)
            .background { shape.fill(configuration.isPressed ? pressed : .clear) }
            .contentShape(shape)
            .hoverEffect(.highlight)
            .padding(.horizontal, -ShalomTheme.Spacing.s)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
