import Foundation
import XCTest
@testable import Shalom

/// Authored, not run. No network, auth, payment or real user storage.
final class GuestImportLedgerTests: XCTestCase {
    func testCountsPersistAndLaterGuestTurnsCanBeOffered() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = GuestImportLedger(directory: root)
        try await first.record(["chat": 2], userID: "account-a")
        let afterRelaunch = GuestImportLedger(directory: root)
        let counts = try await afterRelaunch.load(userID: "account-a")
        XCTAssertEqual(counts["chat"], 2)
        XCTAssertFalse(2 > (counts["chat"] ?? 0))
        XCTAssertTrue(4 > (counts["chat"] ?? 0))
        try await afterRelaunch.record(["chat": 4], userID: "account-a")
        let newest = try await first.load(userID: "account-a")
        XCTAssertEqual(newest["chat"], 4)
    }

    func testAccountsDoNotShareAcknowledgements() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let ledger = GuestImportLedger(directory: root)
        try await ledger.record(["chat": 2], userID: "account-a")
        let other = try await ledger.load(userID: "account-b")
        XCTAssertTrue(other.isEmpty)
    }

    func testAStaleAcknowledgementCannotLoseProgress() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let ledger = GuestImportLedger(directory: root)
        try await ledger.record(["chat": 4], userID: "account-a")
        try await ledger.record(["chat": 2], userID: "account-a")
        let counts = try await ledger.load(userID: "account-a")
        XCTAssertEqual(counts["chat"], 4)
    }
}
