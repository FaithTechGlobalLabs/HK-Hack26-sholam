import Foundation
import XCTest
@testable import ShalomCore

/// Synthetic fixtures only: no real conversations, tokens or accounts.
enum Fixture {
    static func data(_ name: String, _ ext: String) throws -> Data {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: ext),
                                "missing fixture \(name).\(ext)")
        return try Data(contentsOf: url)
    }

    static var chatStream: Data { get throws { try data("chat-stream", "sse") } }

    /// One frame exactly as `encodeEvent` writes it.
    static func frame(_ type: String, _ json: String) -> String {
        "event: \(type)\ndata: \(json)\n\n"
    }

    static func verse(_ id: String, _ text: String = "Synthetic verse text.") -> VerseRecord {
        VerseRecord(id: id, label: BibleReference.verseLabel(id), text: text)
    }

    /// Fetched verses for every id in `book.chapter.start...end`.
    static func verses(_ book: String, _ chapter: Int, _ range: ClosedRange<Int>) -> [String: VerseRecord] {
        var out: [String: VerseRecord] = [:]
        for v in range { let id = "\(book).\(chapter).\(v)"; out[id] = verse(id) }
        return out
    }
}

extension AgentEventDecoder {
    /// Decodes `bytes` delivered in the given chunk sizes (cycled).
    static func decodeAll(_ bytes: [UInt8], chunkSizes: [Int]) throws -> [AgentEvent] {
        var decoder = AgentEventDecoder()
        var events: [AgentEvent] = []
        var index = 0, turn = 0
        while index < bytes.count {
            let size = max(1, chunkSizes[turn % chunkSizes.count])
            let end = min(bytes.count, index + size)
            events += try decoder.push(bytes[index..<end])
            index = end; turn += 1
        }
        XCTAssertFalse(decoder.finish())
        return events
    }
}
