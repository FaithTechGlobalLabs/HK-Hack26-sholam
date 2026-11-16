import Foundation

struct ConversationScrollState: Equatable, Sendable {
    struct Metrics: Equatable, Sendable {
        let top: Double
        let contentHeight: Double
        let viewportHeight: Double

        var bottomDistance: Double { top + contentHeight - viewportHeight }
        var isValid: Bool {
            top.isFinite && contentHeight.isFinite && viewportHeight.isFinite
                && contentHeight >= 0 && viewportHeight > 0
        }
    }

    private(set) var metrics: Metrics?
    private(set) var isFollowing = true
    private(set) var isUserInteracting = false
    private(set) var isProgrammatic = false

    var isNearLatest: Bool { metrics.map { $0.bottomDistance <= 12 } ?? true }
    var needsScrollToLatest: Bool {
        guard let metrics else { return false }
        return isFollowing && !isUserInteracting
            && metrics.contentHeight > metrics.viewportHeight + 1
            && metrics.bottomDistance > 1
    }

    mutating func observe(_ next: Metrics) {
        guard next.isValid else { return }
        let previous = metrics
        metrics = next
        guard !isUserInteracting else { return }
        if isNearLatest {
            isFollowing = true
        } else if let previous, !isProgrammatic {
            let unchangedSize = abs(next.contentHeight - previous.contentHeight) < 0.5
                && abs(next.viewportHeight - previous.viewportHeight) < 0.5
            if unchangedSize && abs(next.top - previous.top) > 1 {
                isFollowing = false
            }
        }
    }

    mutating func beginUserInteraction() {
        isUserInteracting = true
        isProgrammatic = false
        isFollowing = false
    }

    mutating func endUserInteraction() {
        isUserInteracting = false
        if isNearLatest { isFollowing = true }
    }

    mutating func followLatest() {
        isFollowing = true
    }

    mutating func beginProgrammaticScroll() { isProgrammatic = true }
    mutating func endProgrammaticScroll() { isProgrammatic = false }
}
