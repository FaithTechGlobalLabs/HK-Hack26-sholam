import Foundation
import XCTest
@testable import ShalomCore

final class ChatCacheTests: XCTestCase {
    private var root: URL!
    private let production = "https://sholam.vercel.app"
    private let local = "http://localhost:5310"

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appending(path: "ShalomCoreTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    }

    override func tearDownWithError() throws {
        if let root { try? FileManager.default.removeItem(at: root) }
    }

    private func thread(_ id: String, updatedAt: String, text: String = "Hello",
                        delivery: MessageDelivery = .complete) -> ChatThread {
        ChatThread(id: id, title: "Synthetic", updatedAt: updatedAt, messages: [
            ChatMessage(id: "\(id)-u", role: .user, text: text),
            ChatMessage(id: "\(id)-a", role: .assistant, text: "Reply", delivery: delivery),
        ])
    }

    private func threadsFile(_ scope: ChatCacheScope) -> URL {
        root.appending(path: "v\(ChatCache.formatVersion)/chats/\(scope.directoryName)/threads.json")
    }

    func testRoundTripNewestFirst() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        try await cache.saveThread(thread("a", updatedAt: "2026-11-01T00:00:00.000Z"), scope: scope)
        try await cache.saveThread(thread("b", updatedAt: "2026-11-02T00:00:00.000Z"), scope: scope)
        try await cache.saveThread(thread("a", updatedAt: "2026-11-03T00:00:00.000Z", text: "edited"), scope: scope)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(threads.map(\.id), ["a", "b"])
        XCTAssertEqual(threads[0].messages[0].text, "edited")
    }

    func testScopesAreIsolatedAndClearIsScoped() async throws {
        let cache = ChatCache(rootDirectory: root)
        let guest = ChatCacheScope(environment: production, userID: nil)
        let alice = ChatCacheScope(environment: production, userID: "00000000-0000-4000-8000-00000000000a")
        let bob = ChatCacheScope(environment: production, userID: "00000000-0000-4000-8000-00000000000b")
        let aliceLocal = ChatCacheScope(environment: local, userID: alice.userID)
        let literalGuest = ChatCacheScope(environment: production, userID: "guest")
        for (scope, id) in [(guest, "g"), (alice, "a"), (bob, "b"), (aliceLocal, "al"), (literalGuest, "lg")] {
            try await cache.saveThread(thread(id, updatedAt: "2026-11-01T00:00:00Z"), scope: scope)
        }
        let aliceThreads = try await cache.loadThreads(scope: alice)
        XCTAssertEqual(aliceThreads.map(\.id), ["a"])
        let guestThreads = try await cache.loadThreads(scope: guest)
        XCTAssertEqual(guestThreads.map(\.id), ["g"])
        let localThreads = try await cache.loadThreads(scope: aliceLocal)
        XCTAssertEqual(localThreads.map(\.id), ["al"])
        let literal = try await cache.loadThreads(scope: literalGuest)
        XCTAssertEqual(literal.map(\.id), ["lg"])

        try await cache.clear(scope: alice)
        let cleared = try await cache.loadThreads(scope: alice)
        XCTAssertEqual(cleared, [])
        let bobAfter = try await cache.loadThreads(scope: bob)
        XCTAssertEqual(bobAfter.map(\.id), ["b"])
        let guestAfter = try await cache.loadThreads(scope: guest)
        XCTAssertEqual(guestAfter.map(\.id), ["g"])
        let localAfter = try await cache.loadThreads(scope: aliceLocal)
        XCTAssertEqual(localAfter.map(\.id), ["al"])
    }

    func testCorruptedFileFailsSafelyThenRecovers() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        try await cache.saveThread(thread("a", updatedAt: "2026-11-01T00:00:00Z"), scope: scope)
        try Data("{\"version\":1,\"threads\":[{\"oops\"".utf8).write(to: threadsFile(scope))

        do {
            _ = try await cache.loadThreads(scope: scope)
            XCTFail("corruption must be reported")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .corrupted)
        }
        let afterRemoval = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(afterRemoval, [])
        try await cache.saveThread(thread("b", updatedAt: "2026-11-02T00:00:00Z"), scope: scope)
        let recovered = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(recovered.map(\.id), ["b"])
    }

    func testFileFromAnotherScopeIsRejected() async throws {
        let cache = ChatCache(rootDirectory: root)
        let alice = ChatCacheScope(environment: production, userID: "alice")
        let bob = ChatCacheScope(environment: production, userID: "bob")
        try await cache.saveThread(thread("a", updatedAt: "2026-11-01T00:00:00Z"), scope: alice)
        try FileManager.default.createDirectory(at: threadsFile(bob).deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: threadsFile(alice), to: threadsFile(bob))
        do {
            _ = try await cache.loadThreads(scope: bob)
            XCTFail("another account's file must not load")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .corrupted)
        }
    }

    func testOtherFormatVersionIsIgnoredNotDeleted() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        let url = threadsFile(scope)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"version\":99,\"future\":true}".utf8).write(to: url)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(threads, [])
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
    }

    func testOtherFormatVersionIsNeverOverwrittenBySave() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        let url = threadsFile(scope)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let future = Data("{\"version\":99,\"future\":true}".utf8)
        try future.write(to: url)
        do {
            try await cache.saveThread(thread("a", updatedAt: "2026-11-01T00:00:00Z"), scope: scope)
            XCTFail("must not overwrite another version's file")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .unsupportedVersion)
        }
        XCTAssertEqual(try Data(contentsOf: url), future)

        let deckURL = root.appending(path: "v\(ChatCache.formatVersion)/public-deck.json")
        try future.write(to: deckURL)
        do {
            try await cache.saveDeck([], fetchedAt: Date())
            XCTFail("must not overwrite another version's deck")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .unsupportedVersion)
        }
        XCTAssertEqual(try Data(contentsOf: deckURL), future)
        let deck = try await cache.loadDeck()
        XCTAssertNil(deck)
    }

    func testExplicitlySavedOlderThreadIsKeptWhenFull() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        for i in 0..<ChatCache.maxThreads {
            try await cache.saveThread(thread("t\(i)", updatedAt: String(format: "2026-11-10T00:%02d:00Z", i)),
                                       scope: scope)
        }
        // Opened from the server: last changed long before every cached chat.
        try await cache.saveThread(thread("old", updatedAt: "2025-01-01T00:00:00Z"), scope: scope)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(threads.count, ChatCache.maxThreads)
        XCTAssertTrue(threads.contains { $0.id == "old" }, "the thread being saved is never dropped")
        XCTAssertEqual(threads.last?.id, "old", "still stored newest first")
        XCTAssertFalse(threads.contains { $0.id == "t0" }, "the oldest other thread made room")
    }

    func testUUIDIdsAreStoredLowercaseAndUpperCaseDuplicatesMerge() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        let upper = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"
        try await cache.saveThread(thread(upper, updatedAt: "2026-11-01T00:00:00Z"), scope: scope)
        try await cache.saveThread(thread(upper.lowercased(), updatedAt: "2026-11-02T00:00:00Z", text: "newer"),
                                   scope: scope)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(threads.map(\.id), [upper.lowercased()])
        XCTAssertEqual(threads[0].messages[0].text, "newer")
    }

    func testScopeFoldersAreBoundedAndTheCurrentOneIsKept() async throws {
        let cache = ChatCache(rootDirectory: root)
        let guest = ChatCacheScope(environment: production, userID: nil)
        try await cache.saveThread(thread("g", updatedAt: "2026-11-01T00:00:00Z"), scope: guest)
        var last = guest
        for i in 0..<(ChatCache.maxScopes + 4) {
            last = ChatCacheScope(environment: production, userID: "user-\(i)")
            try await cache.saveThread(thread("u\(i)", updatedAt: "2026-11-01T00:00:00Z"), scope: last)
        }
        let chats = root.appending(path: "v\(ChatCache.formatVersion)/chats")
        let folders = try FileManager.default.contentsOfDirectory(atPath: chats.path)
        XCTAssertLessThanOrEqual(folders.count, ChatCache.maxScopes)
        let current = try await cache.loadThreads(scope: last)
        XCTAssertEqual(current.map(\.id), ["u\(ChatCache.maxScopes + 3)"])
        let guestThreads = try await cache.loadThreads(scope: guest)
        XCTAssertEqual(guestThreads.map(\.id), ["g"], "account folders are evicted before guest drafts")
    }

    func testStreamingMessagesComeBackIncomplete() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        var live = thread("a", updatedAt: "2026-11-01T00:00:00Z", delivery: .streaming)
        live.messages[1].hasFinalCitationCheck = true
        try await cache.saveThread(live, scope: scope)
        let loaded = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(loaded[0].messages[1].delivery, .incomplete)
        XCTAssertFalse(loaded[0].messages[1].hasFinalCitationCheck)
    }

    func testThreadAndMessageCountsAreBounded() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: nil)
        for i in 0..<(ChatCache.maxThreads + 5) {
            try await cache.saveThread(thread("t\(i)", updatedAt: String(format: "2026-11-01T00:%02d:00Z", i)),
                                       scope: scope)
        }
        var big = thread("big", updatedAt: "2026-12-01T00:00:00Z")
        big.messages = (0..<(ChatCache.maxMessagesPerThread + 10)).map {
            ChatMessage(id: "m\($0)", role: $0.isMultiple(of: 2) ? .user : .assistant, text: "\($0)")
        }
        try await cache.saveThread(big, scope: scope)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertEqual(threads.count, ChatCache.maxThreads)
        XCTAssertEqual(threads.first?.id, "big")
        XCTAssertEqual(threads.first?.messages.count, ChatCache.maxMessagesPerThread)
        XCTAssertEqual(threads.first?.messages.last?.id, "m\(ChatCache.maxMessagesPerThread + 9)")
    }

    func testInvalidScopeIsRefused() async {
        let cache = ChatCache(rootDirectory: root)
        do {
            try await cache.saveThread(thread("a", updatedAt: "x"), scope: ChatCacheScope(environment: "", userID: nil))
            XCTFail("empty environment must be refused")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .invalidScope)
        }
    }

    func testDeckRoundTripWithStaleness() async throws {
        let cache = ChatCache(rootDirectory: root)
        let empty = try await cache.loadDeck()
        XCTAssertNil(empty)
        let fetchedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let card = Flashcard(id: "synthetic-1", kind: .discover, question: "Synthetic?", refs: ["JUD.1.5-JUD.1.11"],
                             category: "big-questions")
        try await cache.saveDeck([card], fetchedAt: fetchedAt)
        let deck = try await cache.loadDeck()
        XCTAssertEqual(deck, CachedDeck(cards: [card], fetchedAt: fetchedAt))
        XCTAssertFalse(try XCTUnwrap(deck).isStale(now: fetchedAt.addingTimeInterval(60)))
        XCTAssertTrue(try XCTUnwrap(deck).isStale(now: fetchedAt.addingTimeInterval(CachedDeck.defaultMaxAge + 1)))
        XCTAssertTrue(try XCTUnwrap(deck).isStale(now: fetchedAt.addingTimeInterval(-3_600)), "future dates are suspect")
    }

    func testCorruptedDeckFallsBack() async throws {
        let cache = ChatCache(rootDirectory: root)
        try await cache.saveDeck([], fetchedAt: Date())
        let url = root.appending(path: "v\(ChatCache.formatVersion)/public-deck.json")
        try Data("not json".utf8).write(to: url)
        do {
            _ = try await cache.loadDeck()
            XCTFail("corrupted deck must be reported")
        } catch {
            XCTAssertEqual(error as? ChatCacheError, .corrupted)
        }
        let afterRemoval = try await cache.loadDeck()
        XCTAssertNil(afterRemoval, "caller falls back to the bundled deck")
    }

    func testRootIsExcludedFromBackupAndHoldsNoTokens() async throws {
        let cache = ChatCache(rootDirectory: root)
        let scope = ChatCacheScope(environment: production, userID: "00000000-0000-4000-8000-00000000000a")
        try await cache.saveThread(thread("a", updatedAt: "2026-11-01T00:00:00Z"), scope: scope)
        let values = try root.resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(values.isExcludedFromBackup, true)
        let raw = try String(decoding: Data(contentsOf: threadsFile(scope)), as: UTF8.self)
        XCTAssertFalse(raw.contains("Bearer"))
        XCTAssertFalse(raw.contains("access_token"))
        XCTAssertFalse(scope.directoryName.contains("/"))
    }
}
