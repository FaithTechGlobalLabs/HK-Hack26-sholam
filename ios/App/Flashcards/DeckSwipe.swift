import CoreGraphics

/// Swipe rules for the flashcard deck, kept pure so they can be tested
/// without a view. A swipe moves the deck by one card at most: the live drag
/// never travels further than one card, and the result is -1, 0 or +1.
enum DeckSwipe {
    /// A swipe moves a card once it travels a fifth of the spacing, or when
    /// a flick would carry it half way.
    static let distanceThreshold: CGFloat = 0.2
    static let flickThreshold: CGFloat = 0.5
    /// Past the first or last card the drag resists.
    static let edgeResistance: CGFloat = 0.3

    /// The horizontal drag as shown on screen: resisted past either end of
    /// the deck and limited to one card's spacing in either direction.
    static func drag(_ dx: CGFloat, stride: CGFloat, atFirst: Bool, atLast: Bool) -> CGFloat {
        let resisted = (atFirst && dx > 0) || (atLast && dx < 0) ? dx * edgeResistance : dx
        let limit = max(stride, 1)
        return min(limit, max(-limit, resisted))
    }

    /// The change of position when a horizontal swipe ends. `travelled` is
    /// the shown drag (see `drag`), `flick` the predicted end translation.
    /// Dragging right (positive) goes back a card. Never more than one card.
    static func step(travelled: CGFloat, flick: CGFloat, stride: CGFloat) -> Int {
        let spacing = max(stride, 1)
        let distance: CGFloat
        if abs(travelled) > spacing * distanceThreshold {
            distance = travelled
        } else if abs(flick) > spacing * flickThreshold {
            distance = flick
        } else {
            return 0
        }
        return distance > 0 ? -1 : 1
    }
}
