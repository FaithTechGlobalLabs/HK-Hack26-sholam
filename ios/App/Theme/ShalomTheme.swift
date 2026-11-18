import SwiftUI

/// Central visual tokens for the native app. The values mirror the website's
/// sky and glass identity (`src/app/sky.css`, `src/components/shell/CloudSky.tsx`)
/// so both surfaces read as the same product. Type is always the system font
/// at Dynamic Type text styles; there is no bundled or downloaded typeface.
enum ShalomTheme {
    /// The product name shown in the UI (`src/lib/brand.ts` BRAND_NAME).
    static let brandName = "Shalom"

    // MARK: Frozen named colours (ios/README.md)

    /// Links, references and quiet actions on light paper (#2f68c2).
    static let accent = Color(rgb: 0x2F68C2)
    /// Body text on light paper (#172033).
    static let ink = Color(rgb: 0x172033)
    /// Secondary text on light paper (#475569).
    static let mutedInk = Color(rgb: 0x475569)
    /// Sky gradient, top to bottom (#5a8ed6, #6c9ada, #9eacc6).
    static let skyTop = Color(rgb: 0x5A8ED6)
    static let skyMiddle = Color(rgb: 0x6C9ADA)
    static let skyBottom = Color(rgb: 0x9EACC6)
    /// The milky back of a quick-fact card (rgb 248 251 255).
    static let factPaper = Color(rgb: 0xF8FBFF)
    /// The warmer back of a discover card (rgb 255 249 241).
    static let discoverPaper = Color(rgb: 0xFFF9F1)

    // MARK: Supporting colours

    /// The sky's lower band (#86a3cf at 75%), between middle and bottom.
    static let skyLow = Color(rgb: 0x86A3CF)
    /// Deep blue of active text on white and of primary card buttons (#1f4f9e).
    static let skyInk = Color(rgb: 0x1F4F9E)
    /// Pressed primary button (#1a4387).
    static let skyInkPressed = Color(rgb: 0x1A4387)
    /// White type sitting on the sky or on blue glass.
    static let onSky = Color.white
    static let onSkyMuted = Color.white.opacity(0.86)
    /// Opaque stand-ins for glass when Reduce Transparency is on. White type
    /// on these passes WCAG AA at body sizes.
    static let glassSolid = Color(rgb: 0x2B5DB3)
    static let glassSolidEmphasis = Color(rgb: 0x1F4F9E)
    /// The glass tint gradient (sky.css `.glass`).
    static let glassTintTop = Color(red: 120 / 255, green: 175 / 255, blue: 1)
    static let glassTintBottom = Color(red: 88 / 255, green: 148 / 255, blue: 240 / 255)
    static let glassStroke = Color.white.opacity(0.35)
    /// Shaded underside of a cloud (rgb 150 162 186 in the web sprites).
    static let cloudShade = Color(red: 150 / 255, green: 162 / 255, blue: 186 / 255)
    /// Warm light behind the cross-shaped cloud.
    static let crossGlow = Color(red: 1, green: 246 / 255, blue: 225 / 255)

    static var skyGradient: Gradient { Gradient(stops: [
        .init(color: skyTop, location: 0),
        .init(color: skyMiddle, location: 0.4),
        .init(color: skyLow, location: 0.75),
        .init(color: skyBottom, location: 1),
    ]) }

    // MARK: Layout

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let s: CGFloat = 12
        static let m: CGFloat = 16
        static let l: CGFloat = 24
        static let xl: CGFloat = 32
    }

    enum Radius {
        static let card: CGFloat = 28
        static let panel: CGFloat = 24
        static let button: CGFloat = 16
        static let chip: CGFloat = 22
    }

    enum Size {
        /// Apple's minimum hit target.
        static let minTarget: CGFloat = 44
        /// Primary card actions, a little taller than the minimum.
        static let primaryButton: CGFloat = 50
        /// Readable column for headers and chrome on wide screens.
        static let readableWidth: CGFloat = 600
    }

    /// One spacing rhythm shared by both faces of a flashcard.
    enum Card {
        static let frontTop = Color(rgb: 0x1A3E96)
        static let frontMiddle = Color(rgb: 0x1E46A0)
        static let frontBottom = Color(rgb: 0x285ABE)
        static let frontSolidBottom = Color(rgb: 0x2554AE)
        static let labelGap: CGFloat = Spacing.s
        /// Gap from the reading area to the pinned actions, front and back.
        static let actionsGap: CGFloat = Spacing.m
        /// Gap between stacked actions (Ask Shalom over Next card).
        static let actionsStack: CGFloat = Spacing.xs
        /// Gap before the notes that follow an answer (explanation, open
        /// question note), the same for every card kind.
        static let notesGap: CGFloat = Spacing.s
        /// Where a short question rests in the free reading area: this
        /// share of the spare height sits above it, the rest below, so it
        /// reads a little above centre. Content taller than the area
        /// starts at the top and scrolls.
        static let questionRest: CGFloat = 0.4
    }

    /// Quiet, task-led motion for a reading and study surface: short,
    /// ease-out, no spring, bounce or overshoot, and nothing ambient.
    enum Motion {
        /// Moving one card along the deck: a short, settled slide.
        static var carousel: Animation { .easeOut(duration: carouselDuration) }
        static let carouselDuration: Double = 0.24
        /// Question to answer (and back): the faces crossfade in place, no
        /// card turn.
        static var reveal: Animation { crossfade }
        /// Opacity-only change, also the Reduce Motion stand-in for any slide.
        static var crossfade: Animation { .easeInOut(duration: 0.2) }
    }
}

/// Colours for one kind of card (sky.css `.flashcard` and
/// `.flashcard[data-kind="discover"]`).
struct CardPalette: Equatable {
    let paper: Color
    let ink: Color
    let muted: Color
    let accent: Color
    let rule: Color
    let primary: Color
    let primaryPressed: Color

    static let fact = CardPalette(
        paper: ShalomTheme.factPaper,
        ink: ShalomTheme.ink,
        muted: ShalomTheme.mutedInk,
        accent: ShalomTheme.accent,
        rule: ShalomTheme.ink.opacity(0.12),
        primary: ShalomTheme.skyInk,
        primaryPressed: ShalomTheme.skyInkPressed
    )

    static let discover = CardPalette(
        paper: ShalomTheme.discoverPaper,
        ink: Color(rgb: 0x2A2118),
        muted: Color(rgb: 0x5C4F40),
        accent: Color(rgb: 0x9A5410),
        rule: Color(rgb: 0x2A2118).opacity(0.13),
        primary: ShalomTheme.skyInk,
        primaryPressed: ShalomTheme.skyInkPressed
    )
}

extension Color {
    /// sRGB colour from a 0xRRGGBB literal.
    init(rgb: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: opacity
        )
    }
}
