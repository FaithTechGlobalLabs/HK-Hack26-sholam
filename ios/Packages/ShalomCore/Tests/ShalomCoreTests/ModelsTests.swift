import Foundation
import XCTest
@testable import ShalomCore

/// Authored, not executed in the source-only phase.
final class ModelsTests: XCTestCase {
    func testNewAndSuppliedChatIDsUsePostgresUUIDCase() {
        let generated = ChatThread()
        XCTAssertEqual(generated.id, generated.id.lowercased())
        let supplied = ChatThread(id: "ABCD1234-1234-4234-8234-ABCD12345678")
        XCTAssertEqual(supplied.id, "abcd1234-1234-4234-8234-abcd12345678")
    }

    func testLegacyEvidenceDoesNotInventFinalCheck() throws {
        let json = """
        {"id":"c:1","role":"assistant","text":"[John 11:35](verse:JHN.11.35)",
         "verses":{"JHN.11.35":{"id":"JHN.11.35","label":"John 11:35","text":"Jesus wept.","translation":"BSB"}},
         "unverified":{},"quoteWarnings":[],"cards":[]}
        """
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(json.utf8))
        XCTAssertFalse(message.hasFinalCitationCheck)
    }

    func testExplicitServerCheckAndLocalRoundTrip() throws {
        let json = """
        {"id":"c:1","role":"assistant","text":"Peace","verses":{},"unverified":{},"checked":true}
        """
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(json.utf8))
        XCTAssertTrue(message.hasFinalCitationCheck)
        let reloaded = try JSONDecoder().decode(ChatMessage.self, from: JSONEncoder().encode(message))
        XCTAssertTrue(reloaded.hasFinalCitationCheck)
    }

    func testFailureCannotRetainCheckedStatusOnReload() throws {
        let json = """
        {"id":"c:1","role":"assistant","text":"Partial","checked":true,"error":"Interrupted"}
        """
        let message = try JSONDecoder().decode(ChatMessage.self, from: Data(json.utf8))
        XCTAssertFalse(message.hasFinalCitationCheck)
    }
}
