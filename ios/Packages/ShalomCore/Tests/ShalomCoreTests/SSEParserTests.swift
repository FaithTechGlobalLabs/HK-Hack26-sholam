import Foundation
import XCTest
@testable import ShalomCore

final class SSEParserTests: XCTestCase {
    func testFixtureDecodesEveryEventInOrder() throws {
        let events = try AgentEventDecoder.decodeAll(Array(Fixture.chatStream), chunkSizes: [4096])
        XCTAssertEqual(events.count, 10)
        guard case .flashcards(let cards) = events[0] else { return XCTFail("flashcards first") }
        XCTAssertEqual(cards.first?.id, "synthetic-card-1")
        XCTAssertEqual(events[1], .toolStart(id: "call_1", name: "get_passage",
                                             input: .object(["reference": .string("John 3:16-17")])))
        XCTAssertEqual(events[2], .toolResult(id: "call_1", name: "get_passage", ok: true,
                                              summary: "John 3:16–17 (2 verses)"))
        guard case .verses(let verses) = events[3] else { return XCTFail("verses") }
        XCTAssertEqual(verses.map(\.id), ["JHN.3.16", "JHN.3.17"])
        XCTAssertEqual(events[4], .textDelta("Draft with “quotes” 🙏 "))
        XCTAssertEqual(events[5], .reset(reason: "verse_check", text: nil))
        XCTAssertEqual(events[8], .citations(
            unverified: [CitationIssue(verseId: "ROM.8.28", label: "Romans 8:28", reason: .notFetched)],
            quoteWarnings: []))
        XCTAssertEqual(events[9], .done(stopReason: "end_turn",
                                        messageId: "00000000-0000-4000-8000-000000000001", saved: true))
    }

    func testEverySplitPointGivesTheSameEvents() throws {
        let bytes = Array(try Fixture.chatStream)
        let expected = try AgentEventDecoder.decodeAll(bytes, chunkSizes: [bytes.count])
        for split in 1..<bytes.count {
            var decoder = AgentEventDecoder()
            var events = try decoder.push(bytes[..<split])
            events += try decoder.push(bytes[split...])
            XCTAssertEqual(events, expected, "split at \(split)")
        }
        XCTAssertEqual(try AgentEventDecoder.decodeAll(bytes, chunkSizes: [1]), expected)
        XCTAssertEqual(try AgentEventDecoder.decodeAll(bytes, chunkSizes: [3, 7, 2, 13]), expected)
    }

    func testMultiByteCharacterSplitInsideItsBytes() throws {
        let bytes = Array(Fixture.frame("text_delta", #"{"text":"🕊️ peace"}"#).utf8)
        let dove = Array("🕊".utf8)
        let start = try XCTUnwrap(bytes.firstRange(of: dove)).lowerBound
        for offset in 1..<dove.count {
            var decoder = AgentEventDecoder()
            XCTAssertEqual(try decoder.push(bytes[..<(start + offset)]), [])
            XCTAssertEqual(try decoder.push(bytes[(start + offset)...]), [.textDelta("🕊️ peace")])
        }
    }

    func testCRLFSplitAcrossChunks() throws {
        let text = "event: text_delta\r\ndata: {\"text\":\"a\"}\r\n\r\nevent: done\r\ndata: {\"stopReason\":\"end_turn\"}\r\n\r\n"
        let bytes = Array(text.utf8)
        for (index, byte) in bytes.enumerated() where byte == 0x0D {
            var decoder = AgentEventDecoder()
            var events = try decoder.push(bytes[...index])      // ends on CR
            events += try decoder.push(bytes[(index + 1)...])   // starts with LF
            XCTAssertEqual(events, [.textDelta("a"), .done(stopReason: "end_turn", messageId: nil, saved: nil)])
            XCTAssertFalse(decoder.finish())
        }
    }

    func testLoneCRLineEndings() throws {
        var decoder = AgentEventDecoder()
        let events = try decoder.push(Array("event: text_delta\rdata: {\"text\":\"x\"}\r\r".utf8))
        XCTAssertEqual(events, [.textDelta("x")])
    }

    func testCommentsAndMultipleDataLines() throws {
        let text = ": keep-alive\n\nevent: text_delta\n: inside a frame\ndata: {\"text\":\ndata: \"joined\"}\nid: 7\nretry: 100\n\n"
        var decoder = AgentEventDecoder()
        XCTAssertEqual(try decoder.push(Array(text.utf8)), [.textDelta("joined")])
        XCTAssertEqual(decoder.droppedFrames, 0)
    }

    func testFieldWithoutSpaceAndLeadingBOM() throws {
        var decoder = AgentEventDecoder()
        let bytes: [UInt8] = [0xEF, 0xBB, 0xBF] + Array("event:text_delta\ndata:{\"text\":\"b\"}\n\n".utf8)
        XCTAssertEqual(try decoder.push(bytes[..<2]), [])
        XCTAssertEqual(try decoder.push(bytes[2...]), [.textDelta("b")])
    }

    func testUnknownAndMalformedFramesAreDroppedNotFatal() throws {
        let text = Fixture.frame("future_event", #"{"x":1}"#)
            + Fixture.frame("text_delta", #"{"text":5}"#)            // wrong type
            + Fixture.frame("citations", #"{"unverified":[{"verseId":"JHN.3.16","label":"John 3:16","reason":"other"}],"quoteWarnings":[]}"#)
            + Fixture.frame("done", "{not json")
            + "data: {\"text\":\"no event name\"}\n\n"                  // default `message`
            + "event: text_delta\n\n"                                  // no data: not dispatched
            + Fixture.frame("text_delta", #"{"text":"ok"}"#)
        var decoder = AgentEventDecoder()
        XCTAssertEqual(try decoder.push(Array(text.utf8)), [.textDelta("ok")])
        XCTAssertEqual(decoder.unknownFrames, 2)   // future_event, message
        XCTAssertEqual(decoder.droppedFrames, 3)   // wrong type, unknown reason, bad JSON
    }

    func testDoneWithAndWithoutSavedAndToolStartWithoutInput() throws {
        let text = Fixture.frame("done", #"{"stopReason":"end_turn"}"#)
            + Fixture.frame("done", #"{"stopReason":"max_tokens","messageId":"m","saved":false}"#)
            + Fixture.frame("tool_start", #"{"id":"t","name":"search_bible"}"#)
            + Fixture.frame("reset", #"{"reason":"restore","text":"draft"}"#)
            + Fixture.frame("error", #"{"message":"Model unavailable"}"#)
        var decoder = AgentEventDecoder()
        XCTAssertEqual(try decoder.push(Array(text.utf8)), [
            .done(stopReason: "end_turn", messageId: nil, saved: nil),
            .done(stopReason: "max_tokens", messageId: "m", saved: false),
            .toolStart(id: "t", name: "search_bible", input: .null),
            .reset(reason: "restore", text: "draft"),
            .error("Model unavailable"),
        ])
    }

    func testOversizedLineAndDataAreRejected() {
        var line = AgentEventDecoder(maxFrameBytes: 64)
        XCTAssertThrowsError(try line.push(Array(("data: " + String(repeating: "a", count: 100)).utf8))) {
            XCTAssertEqual($0 as? SSEParserError, .frameTooLarge)
        }
        var data = AgentEventDecoder(maxFrameBytes: 64)
        let many = String(repeating: "data: 0123456789\n", count: 10)
        XCTAssertThrowsError(try data.push(Array(many.utf8))) {
            XCTAssertEqual($0 as? SSEParserError, .frameTooLarge)
        }
    }

    func testFinishReportsAnUnterminatedFrame() throws {
        var decoder = AgentEventDecoder()
        XCTAssertEqual(try decoder.push(Array("event: done\ndata: {\"stopReason\":\"end_turn\"}\n".utf8)), [])
        XCTAssertTrue(decoder.finish(), "a done frame without its blank line must not count")
        var clean = AgentEventDecoder()
        _ = try clean.push(Array(Fixture.frame("text_delta", #"{"text":"a"}"#).utf8))
        XCTAssertFalse(clean.finish())
    }
}
