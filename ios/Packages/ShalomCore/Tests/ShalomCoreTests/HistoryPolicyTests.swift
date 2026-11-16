import Foundation
import XCTest
@testable import ShalomCore

final class HistoryPolicyTests: XCTestCase {
    private func turns(_ count: Int, content: (Int) -> String = { "turn \($0)" }) -> [HistoryTurn] {
        (0..<count).map { HistoryTurn(role: $0.isMultiple(of: 2) ? .user : .assistant, content: content($0)) }
    }

    func testKeepsNewestTwelveTurnsStartingOnAUserTurn() {
        let trimmed = HistoryPolicy.trim(turns(20))
        // Newest 12 are turns 8...19; turn 8 is a user turn.
        XCTAssertEqual(trimmed.map(\.content), (8..<20).map { "turn \($0)" })
        XCTAssertEqual(trimmed.first?.role, .user)

        // Newest 12 of 21 start on an assistant turn (9), which is dropped.
        let odd = HistoryPolicy.trim(turns(21))
        XCTAssertEqual(odd.count, 11)
        XCTAssertEqual(odd.first?.content, "turn 10")
        XCTAssertEqual(odd.first?.role, .user)
    }

    func testEachTurnIsClippedTo1200UTF16UnitsAndTotalStaysUnder16000() {
        let long = HistoryPolicy.trim(turns(12) { _ in String(repeating: "a", count: 5_000) })
        XCTAssertEqual(long.count, 12)
        for turn in long {
            XCTAssertEqual(turn.content.utf16.count, 1_200)
            XCTAssertTrue(turn.content.hasSuffix("…"))
        }
        // 12 × 1,200 = 14,400: with these caps the 16,000 total never binds
        // for client-built history, but it is still enforced.
        XCTAssertLessThanOrEqual(long.reduce(0) { $0 + $1.content.utf16.count }, HistoryPolicy.maxTotalCharacters)
    }

    func testExactlyTheLimitIsNotClipped() {
        let exact = String(repeating: "b", count: 1_200)
        XCTAssertEqual(HistoryPolicy.clip(exact, maxUTF16: 1_200), exact)
        XCTAssertEqual(HistoryPolicy.clip(exact + "c", maxUTF16: 1_200).utf16.count, 1_200)
    }

    func testClipNeverSplitsSurrogatePairsOrGraphemeClusters() {
        let emoji = String(repeating: "😀", count: 700) // 1,400 UTF-16 units
        let clipped = HistoryPolicy.clip(emoji, maxUTF16: 1_200)
        XCTAssertEqual(clipped.utf16.count, 1_199) // 599 × 2 + "…"
        XCTAssertEqual(clipped.dropLast().count, 599)
        XCTAssertTrue(clipped.dropLast().allSatisfy { $0 == "😀" })

        let family = "👨‍👩‍👧‍👦" // one Character, 11 UTF-16 units
        let mixed = String(repeating: "a", count: 1_190) + family + "tail"
        let cut = HistoryPolicy.clip(mixed, maxUTF16: 1_200)
        XCTAssertFalse(cut.contains(family), "a cluster that does not fit is dropped whole")
        XCTAssertEqual(cut, String(repeating: "a", count: 1_190) + "…")

        let combining = String(repeating: "e\u{301}", count: 700) // é as two scalars
        let accented = HistoryPolicy.clip(combining, maxUTF16: 1_200)
        XCTAssertEqual(accented.dropLast().count, 599)
        XCTAssertTrue(accented.dropLast().allSatisfy { $0 == "e\u{301}" })
    }

    func testBlankTurnsAreSkippedAndLeadingRepliesDropped() {
        let input = [
            HistoryTurn(role: .assistant, content: "orphan reply"),
            HistoryTurn(role: .user, content: "   \n "),
            HistoryTurn(role: .assistant, content: "another reply"),
            HistoryTurn(role: .user, content: "question"),
            HistoryTurn(role: .assistant, content: "answer"),
        ]
        XCTAssertEqual(HistoryPolicy.trim(input), [
            HistoryTurn(role: .user, content: "question"),
            HistoryTurn(role: .assistant, content: "answer"),
        ])
        XCTAssertEqual(HistoryPolicy.trim([HistoryTurn(role: .assistant, content: "only")]), [])
    }

    func testForMessagesExcludesStreamingAndEmptyMessages() {
        let messages = [
            ChatMessage(id: "1", role: .user, text: "Who was Ruth?"),
            ChatMessage(id: "2", role: .assistant, text: "Partial answer", delivery: .stopped),
            ChatMessage(id: "3", role: .user, text: "And Naomi?"),
            ChatMessage(id: "4", role: .assistant, text: "", error: "failed", delivery: .failed),
            ChatMessage(id: "5", role: .assistant, text: "still streaming", delivery: .streaming),
        ]
        XCTAssertEqual(HistoryPolicy.forMessages(messages), [
            HistoryTurn(role: .user, content: "Who was Ruth?"),
            HistoryTurn(role: .assistant, content: "Partial answer"),
            HistoryTurn(role: .user, content: "And Naomi?"),
        ])
    }
}
