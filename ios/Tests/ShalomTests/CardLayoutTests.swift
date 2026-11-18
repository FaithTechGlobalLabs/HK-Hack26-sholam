import CoreGraphics
import Testing
@testable import Shalom

@Suite struct CardLayoutTests {
    @Test func noCueBeforeMeasurementOrWhenContentFits() {
        #expect(!CardReadingMetrics(contentFrame: .null, availableHeight: 300, visibleHeight: 300).overflows)
        #expect(!metrics(height: 200).overflows)
        #expect(!metrics(height: 300).overflows)
        #expect(!metrics(height: 301).overflows)
    }

    @Test func longContentShowsCueUntilBottomIsVisible() {
        #expect(metrics(height: 600).hasMoreBelow)
        #expect(metrics(height: 600, offset: -200).hasMoreBelow)
        #expect(!metrics(height: 600, offset: -330).hasMoreBelow)
        #expect(!metrics(height: 600, offset: -350).hasMoreBelow)
    }

    @Test func cueReservationDoesNotDependOnScrollPosition() {
        #expect(metrics(height: 600, offset: -330).overflows)
        #expect(!metrics(height: 600, offset: -330).hasMoreBelow)
        #expect(metrics(height: 600, offset: 20).overflows)
    }

    @Test func rotationCanRemoveOverflowWithoutChangingContent() {
        let expanded = CardReadingMetrics(contentFrame: CGRect(x: 0, y: 0, width: 300, height: 600),
                                          availableHeight: 650, visibleHeight: 650)
        #expect(!expanded.overflows)
        #expect(!expanded.hasMoreBelow)
    }

    @Test func zeroHeightDoesNotClaimContentBelow() {
        let pending = CardReadingMetrics(contentFrame: CGRect(x: 0, y: 0, width: 300, height: 600),
                                         availableHeight: 0, visibleHeight: 0)
        #expect(!pending.overflows)
        #expect(!pending.hasMoreBelow)
    }

    private func metrics(height: CGFloat, offset: CGFloat = 0) -> CardReadingMetrics {
        CardReadingMetrics(contentFrame: CGRect(x: 0, y: offset, width: 300, height: height),
                           availableHeight: 300, visibleHeight: 270)
    }
}
