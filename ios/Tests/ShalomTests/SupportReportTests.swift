import XCTest
@testable import Shalom

final class SupportReportTests: XCTestCase {
    func testTheAnswerIsExcludedByDefault() {
        let draft = sample(answer: "PRIVATE ANSWER")
        XCTAssertFalse(draft.includeAnswer)
        XCTAssertFalse(draft.text.contains("PRIVATE ANSWER"))
        XCTAssertTrue(draft.text.contains("Answer text: not included"))
    }

    func testAnswerSharingRequiresAnExplicitChoice() {
        var draft = sample(answer: "A chosen answer")
        draft.includeAnswer = true
        XCTAssertTrue(draft.text.contains("A chosen answer"))
        draft.includeAnswer = false
        XCTAssertFalse(draft.text.contains("A chosen answer"))
    }

    func testUserTextIsBoundedWithoutSplittingGraphemes() {
        var draft = sample(answer: String(repeating: "👩🏽‍💻", count: 8_001))
        draft.notes = String(repeating: "é", count: 2_001)
        draft.includeAnswer = true
        XCTAssertTrue(draft.text.contains("Answer shortened"))
        XCTAssertEqual(SupportReportDraft.clip("👩🏽‍💻é", to: 1), "👩🏽‍💻")
        XCTAssertFalse(draft.text.contains(String(repeating: "é", count: 2_001)))
    }

    func testTheSameInputProducesTheSameExportPreview() {
        let draft = sample(answer: nil)
        XCTAssertEqual(draft.text, draft.text)
        XCTAssertFalse(draft.hasAnswer)
        XCTAssertTrue(draft.text.contains("does not automatically add account"))
    }

    private func sample(answer: String?) -> SupportReportDraft {
        SupportReportDraft(reason: .citationProblem, answerText: answer,
                           appVersion: "test", buildNumber: "0", systemDescription: "test OS")
    }
}
