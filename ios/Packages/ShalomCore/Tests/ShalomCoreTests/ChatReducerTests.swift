import Foundation
import XCTest
@testable import ShalomCore

final class ChatReducerTests: XCTestCase {
    private func streamed(_ events: [AgentEvent]) -> ChatMessage {
        var message = ChatReducer.newAssistantMessage(id: "a1")
        for event in events { ChatReducer.apply(event, to: &message) }
        return message
    }

    func testFixtureStreamOnlyVerifiesAfterFinalCitations() throws {
        let events = try AgentEventDecoder.decodeAll(Array(Fixture.chatStream), chunkSizes: [17])
        var message = ChatReducer.newAssistantMessage(id: "a1")
        let citationsIndex = try XCTUnwrap(events.firstIndex {
            if case .citations = $0 { return true } else { return false }
        })
        for event in events[..<citationsIndex] { ChatReducer.apply(event, to: &message) }

        // Before the check: fetched text may show, nothing is verified.
        XCTAssertFalse(message.hasFinalCitationCheck)
        XCTAssertEqual(message.text, "God’s love — see [John 3:16–17](verse:JHN.3.16) and [Romans 8:28](verse:ROM.8.28). 🕊️")
        XCTAssertTrue(CitationResolver.passages(in: message).allSatisfy { !$0.isVerified })

        for event in events[citationsIndex...] { ChatReducer.apply(event, to: &message) }
        XCTAssertEqual(message.delivery, .complete)
        XCTAssertTrue(message.hasFinalCitationCheck)
        let passages = CitationResolver.passages(in: message)
        XCTAssertEqual(passages.map(\.id), ["JHN.3.16", "ROM.8.28"])
        XCTAssertTrue(passages[0].isVerified)
        XCTAssertEqual(passages[0].verses.map(\.id), ["JHN.3.16", "JHN.3.17"]) // full labelled range
        XCTAssertFalse(passages[1].isVerified)
        XCTAssertEqual(passages[1].issue, .notFetched)
        XCTAssertEqual(message.cards.count, 1)
        XCTAssertEqual(message.tools, [ToolStatus(id: "call_1", name: "get_passage", done: true, ok: true,
                                                  summary: "John 3:16–17 (2 verses)")])
    }

    func testResetReplacesTextAndClearsProvisionalCheck() {
        var message = ChatReducer.newAssistantMessage()
        message.text = "old draft"
        message.unverified = ["JHN.3.16": .quoteMismatch]
        message.quoteWarnings = ["Romans 8:28"]
        message.hasFinalCitationCheck = true
        ChatReducer.apply(.reset(reason: "verse_check", text: nil), to: &message)
        XCTAssertEqual(message.text, "")
        XCTAssertEqual(message.unverified, [:])
        XCTAssertEqual(message.quoteWarnings, [])
        XCTAssertFalse(message.hasFinalCitationCheck)

        ChatReducer.apply(.reset(reason: "restore", text: "restored draft"), to: &message)
        XCTAssertEqual(message.text, "restored draft")
    }

    func testResetKeepsSameTurnVersesForTheCorrectiveRewrite() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("“Wrong words” [John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [CitationIssue(verseId: "JHN.3.16", label: "John 3:16", reason: .quoteMismatch)],
                       quoteWarnings: ["John 3:16"]),
            .reset(reason: "verse_check", text: nil),
        ])
        XCTAssertEqual(Array(message.verses.keys), ["JHN.3.16"], "fetched evidence survives the reset")
        XCTAssertEqual(message.unverified, [:])
        XCTAssertEqual(message.quoteWarnings, [])
        XCTAssertFalse(message.hasFinalCitationCheck)

        var rewritten = message
        for event: AgentEvent in [.verses([Fixture.verse("JHN.3.17")]),
                                  .textDelta("[John 3:16](verse:JHN.3.16)"),
                                  .citations(unverified: [], quoteWarnings: []),
                                  .done(stopReason: "end_turn", messageId: nil, saved: true)] {
            ChatReducer.apply(event, to: &rewritten)
        }
        XCTAssertEqual(Set(rewritten.verses.keys), ["JHN.3.16", "JHN.3.17"], "verses after a reset still count")
        XCTAssertTrue(rewritten.hasFinalCitationCheck)
        XCTAssertTrue(CitationResolver.passages(in: rewritten)[0].isVerified)
    }

    func testErrorAfterCitationsClearsTheFinalCheck() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("[John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [], quoteWarnings: []),
            .error("Model unavailable"),
        ])
        XCTAssertEqual(message.delivery, .failed)
        XCTAssertFalse(message.hasFinalCitationCheck)
        XCTAssertFalse(CitationResolver.passages(in: message)[0].isVerified)
    }

    func testNewAssistantMessageIDsAreLowercase() {
        let id = ChatReducer.newAssistantMessage().id
        XCTAssertEqual(id, id.lowercased())
    }

    func testRestoreThenCitationsOrderingSettlesChecked() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("rewrite in progress"),
            .reset(reason: "restore", text: "Draft [John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [], quoteWarnings: []),
            .done(stopReason: "end_turn", messageId: nil, saved: nil),
        ])
        XCTAssertEqual(message.text, "Draft [John 3:16](verse:JHN.3.16)")
        XCTAssertTrue(CitationResolver.passages(in: message)[0].isVerified)
    }

    func testLateQuoteMismatchOverridesFetchedVerses() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("“Wrong words” [John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [
                CitationIssue(verseId: "JHN.3.16", label: "John 3:16", reason: .quoteMismatch),
                CitationIssue(verseId: "JHN.3.16", label: "John 3:16", reason: .notFetched),
            ], quoteWarnings: []),
            .done(stopReason: "end_turn", messageId: nil, saved: true),
        ])
        XCTAssertEqual(message.unverified["JHN.3.16"], .quoteMismatch)
        let passage = CitationResolver.passages(in: message)[0]
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.issue, .quoteMismatch)
        XCTAssertEqual(passage.verses, [], "mismatched text must not be shown as the passage")
    }

    func testVersesAfterTheFinalCheckDoNotCount() {
        let message = streamed([
            .textDelta("[John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [CitationIssue(verseId: "JHN.3.16", label: "John 3:16", reason: .notFetched)],
                       quoteWarnings: []),
            .verses([Fixture.verse("JHN.3.16")]),
            .done(stopReason: "end_turn", messageId: nil, saved: nil),
        ])
        XCTAssertEqual(message.verses, [:])
        XCTAssertFalse(CitationResolver.passages(in: message)[0].isVerified)
    }

    func testTextAfterTheCheckIsNotCoveredByIt() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("[John 3:16](verse:JHN.3.16)"),
            .citations(unverified: [], quoteWarnings: []),
            .textDelta(" and more"),
        ])
        XCTAssertFalse(message.hasFinalCitationCheck)
    }

    func testDoneWithoutCitationsStaysUnchecked() {
        let message = streamed([
            .verses([Fixture.verse("JHN.3.16")]),
            .textDelta("[John 3:16](verse:JHN.3.16)"),
            .done(stopReason: "end_turn", messageId: nil, saved: nil),
        ])
        XCTAssertEqual(message.delivery, .complete)
        XCTAssertFalse(message.hasFinalCitationCheck)
        let passage = CitationResolver.passages(in: message)[0]
        XCTAssertFalse(passage.isVerified)
        XCTAssertEqual(passage.verses.count, 1)
    }

    func testEventsAfterDoneOrErrorAreIgnored() {
        var message = streamed([.textDelta("a"), .done(stopReason: "end_turn", messageId: nil, saved: nil)])
        ChatReducer.apply(.textDelta("b"), to: &message)
        ChatReducer.apply(.error("late"), to: &message)
        XCTAssertEqual(message.text, "a")
        XCTAssertNil(message.error)
        XCTAssertEqual(message.delivery, .complete)

        let failed = streamed([.textDelta("partial"), .toolStart(id: "t", name: "x", input: .null),
                               .error("Model unavailable"), .textDelta("more")])
        XCTAssertEqual(failed.delivery, .failed)
        XCTAssertEqual(failed.error, "Model unavailable")
        XCTAssertEqual(failed.text, "partial")
        XCTAssertTrue(failed.tools.allSatisfy(\.done))
    }

    func testStreamEndsAreDistinguished() {
        var incomplete = streamed([.textDelta("partial")])
        ChatReducer.finish(&incomplete, error: ShalomAPIError(kind: .incompleteStream))
        XCTAssertEqual(incomplete.delivery, .incomplete)

        var eof = streamed([.textDelta("partial")])
        ChatReducer.finish(&eof, error: nil) // returned without done
        XCTAssertEqual(eof.delivery, .incomplete)

        var stopped = streamed([.textDelta("partial"), .citations(unverified: [], quoteWarnings: [])])
        ChatReducer.finish(&stopped, error: CancellationError())
        XCTAssertEqual(stopped.delivery, .stopped)
        XCTAssertFalse(stopped.hasFinalCitationCheck)

        var limited = streamed([])
        ChatReducer.finish(&limited, error: ShalomAPIError(kind: .rateLimited, statusCode: 429, retryAfter: 60,
                                                            serverMessage: "Please come back later."))
        XCTAssertEqual(limited.delivery, .failed)
        XCTAssertEqual(limited.error, "Please come back later.")

        var done = streamed([.done(stopReason: "end_turn", messageId: nil, saved: nil)])
        ChatReducer.finish(&done, error: nil)
        XCTAssertEqual(done.delivery, .complete)
    }

    func testToolResultWithoutStartAndDuplicateStart() {
        let message = streamed([
            .toolStart(id: "t1", name: "get_passage", input: .null),
            .toolStart(id: "t1", name: "get_passage", input: .null),
            .toolResult(id: "t2", name: "search_bible", ok: false, summary: "No results"),
        ])
        XCTAssertEqual(message.tools.map(\.id), ["t1", "t2"])
        XCTAssertEqual(message.tools[1].ok, false)
    }

    func testPlaceholderIsTheOnlyStateThatAcceptsEvents() {
        var settled = ChatMessage(id: "x", role: .assistant) // default delivery .complete
        ChatReducer.apply(.textDelta("ignored"), to: &settled)
        XCTAssertEqual(settled.text, "")
    }
}
