import Testing
@testable import Shalom

struct ConversationScrollStateTests {
    private func metrics(_ top: Double = 0, height: Double = 900, viewport: Double = 600) -> ConversationScrollState.Metrics {
        .init(top: top, contentHeight: height, viewportHeight: viewport)
    }

    @Test func shortConversationNeedsNoBottomAlignment() {
        var state = ConversationScrollState()
        state.observe(metrics(height: 180))
        #expect(state.isFollowing)
        #expect(state.isNearLatest)
        #expect(!state.needsScrollToLatest)
    }

    @Test func incomingContentDoesNotLookLikeUserScrolling() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.observe(metrics(-300, height: 940))
        #expect(state.isFollowing)
        #expect(state.needsScrollToLatest)
    }

    @Test func draggingUpStopsFollowing() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.beginUserInteraction()
        state.observe(metrics(-100))
        state.endUserInteraction()
        #expect(!state.isFollowing)
        #expect(!state.needsScrollToLatest)
    }

    @Test func manuallyReturningToBottomResumesFollowing() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.beginUserInteraction()
        state.observe(metrics(-100))
        state.endUserInteraction()
        state.observe(metrics(-300))
        #expect(state.isFollowing)
        state.observe(metrics(-300, height: 950))
        #expect(state.needsScrollToLatest)
    }

    @Test func gestureAtBottomWaitsUntilInteractionEnds() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.beginUserInteraction()
        state.observe(metrics(-300))
        #expect(!state.isFollowing)
        state.endUserInteraction()
        #expect(state.isFollowing)
    }

    @Test func trackpadOffsetChangesStopFollowing() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.observe(metrics(-100))
        #expect(!state.isFollowing)
    }

    @Test func programmaticOffsetsDoNotBecomeUserIntent() {
        var state = ConversationScrollState()
        state.observe(metrics(-100))
        state.beginProgrammaticScroll()
        state.observe(metrics(-180))
        #expect(state.isFollowing)
        state.observe(metrics(-300))
        state.endProgrammaticScroll()
        #expect(state.isFollowing)
        #expect(!state.needsScrollToLatest)
    }

    @Test func viewportResizeDoesNotDisableFollowing() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.observe(metrics(-300, viewport: 350))
        #expect(state.isFollowing)
        #expect(state.needsScrollToLatest)
    }

    @Test func invalidGeometryDoesNotPoisonState() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        let previous = state
        state.observe(metrics(.nan))
        state.observe(metrics(viewport: 0))
        #expect(state == previous)
    }

    @Test func explicitLatestRestoresIntentWhileStillAway() {
        var state = ConversationScrollState()
        state.observe(metrics(-300))
        state.observe(metrics(-100))
        state.followLatest()
        #expect(state.isFollowing)
        #expect(state.needsScrollToLatest)
    }
}
