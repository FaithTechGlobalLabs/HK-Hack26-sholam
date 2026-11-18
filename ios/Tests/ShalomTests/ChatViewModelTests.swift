import Foundation
import ShalomCore
import XCTest
@testable import Shalom

/// Authored, NOT RUN: controlled SSE with no network/model/auth dependencies.
@MainActor
final class ChatViewModelTests: XCTestCase {
    func testStopSettlesToolsAndKeepsPartialTextUnchecked() async throws {
        try await withModel { model, api in
            model.send("Who is Jesus?")
            try await eventually { await api.requestCount == 1 }
            await api.emit(.toolStart(id: "tool", name: "lookup_verses", input: .object([:])))
            await api.emit(.textDelta("A partial answer"))
            try await eventually { model.messages.last?.text == "A partial answer" }
            model.stop()
            XCTAssertEqual(model.messages.last?.delivery, .stopped)
            XCTAssertFalse(model.messages.last?.hasFinalCitationCheck ?? true)
            XCTAssertTrue(model.messages.last?.tools.allSatisfy(\.done) ?? false)
        }
    }

    func testLastMomentStopDoesNotDowngradeCompletedCheck() async throws {
        try await withModel { model, api in
            model.send("What is peace?")
            try await eventually { await api.requestCount == 1 }
            await api.emit(.textDelta("Peace"))
            await api.emit(.citations(unverified: [], quoteWarnings: []))
            await api.emit(.done(stopReason: "stop", messageId: nil, saved: nil))
            try await eventually { model.messages.last?.delivery == .complete }
            // Keep the fake socket open to exercise the race after done.
            model.stop()
            XCTAssertEqual(model.messages.last?.delivery, .complete)
            XCTAssertTrue(model.messages.last?.hasFinalCitationCheck ?? false)
        }
    }

    func testIdentityBarrierDropsLateTextAndDrainsWrites() async throws {
        try await withModel { model, api in
            model.send("A guest question")
            try await eventually { await api.requestCount == 1 }
            await api.emit(.textDelta("Guest-only words"))
            try await eventually { model.messages.last?.text == "Guest-only words" }
            await model.invalidateForAccountChange(preservingDraft: true)
            model.changeScope(ChatCacheScope(environment: "https://test.invalid", userID: "00000000-0000-4000-8000-000000000002"))
            await api.emit(.textDelta("Late words"))
            await Task.yield()
            XCTAssertTrue(model.messages.isEmpty)
            XCTAssertFalse(model.isStreaming)
        }
    }

    func testServerErrorIsNotDuplicatedAndIsNotRetried() async throws {
        try await withModel { model, api in
            model.send("A question")
            try await eventually { await api.requestCount == 1 }
            await api.emit(.error("Please try again later."))
            await api.finish()
            try await eventually { !model.isStreaming }
            XCTAssertEqual(model.messages.last?.error, "Please try again later.")
            XCTAssertNil(model.errorMessage)
            let count = await api.requestCount
            XCTAssertEqual(count, 1)
        }
    }

    func testOversizedQuestionDoesNotReachTheTransport() async throws {
        try await withModel { model, api in
            model.send(String(repeating: "a", count: 8_001))
            await Task.yield()
            let count = await api.requestCount
            XCTAssertEqual(count, 0)
            XCTAssertTrue(model.messages.isEmpty)
            XCTAssertNotNil(model.errorMessage)
        }
    }

    func testNoPermissionMeansNoTransportOrHistoryMutation() async throws {
        try await withModel(granted: false) { model, api in
            model.send("A question from a card")
            await Task.yield()
            let count = await api.requestCount
            XCTAssertEqual(count, 0)
            XCTAssertTrue(model.messages.isEmpty)
            XCTAssertEqual(model.draft, "A question from a card")
            XCTAssertTrue(model.isConsentPresented)
            XCTAssertFalse(model.isStreaming)
        }
    }

    func testAllowingDoesNotSendUntilAnotherDeliberateSend() async throws {
        try await withModel(granted: false) { model, api in
            model.draft = "A typed question"
            model.send()
            model.allowAISharing()
            await Task.yield()
            let before = await api.requestCount
            XCTAssertEqual(before, 0)
            XCTAssertFalse(model.isConsentPresented)
            XCTAssertEqual(model.draft, "A typed question")
            model.send()
            try await eventually { await api.requestCount == 1 }
        }
    }

    func testDismissalDoesNotGrantAndNewChatDropsThePendingPrompt() async throws {
        try await withModel(granted: false) { model, api in
            model.send("Do not send yet")
            model.dismissConsent()
            XCTAssertFalse(model.consent.isAllowed)
            XCTAssertEqual(model.draft, "Do not send yet")
            model.newChat()
            XCTAssertEqual(model.draft, "")
            model.allowAISharing()
            await Task.yield()
            let count = await api.requestCount
            XCTAssertEqual(count, 0)
            XCTAssertTrue(model.messages.isEmpty)
        }
    }

    func testRevocationStopsAnActiveAnswerAndBlocksTheNextSend() async throws {
        try await withModel { model, api in
            model.send("A permitted question")
            try await eventually { await api.requestCount == 1 }
            await api.emit(.textDelta("Partial answer"))
            try await eventually { model.messages.last?.text == "Partial answer" }
            model.revokeAISharing()
            XCTAssertFalse(model.isStreaming)
            XCTAssertFalse(model.consent.isAllowed)
            model.send("Blocked question")
            await Task.yield()
            let count = await api.requestCount
            XCTAssertEqual(count, 1)
            XCTAssertTrue(model.isConsentPresented)
            XCTAssertEqual(model.draft, "Blocked question")
        }
    }

    func testImmediateRevocationPreventsTheScheduledTransport() async throws {
        try await withModel { model, api in
            model.send("Never reaches the transport")
            model.revokeAISharing()
            await Task.yield()
            let count = await api.requestCount
            XCTAssertEqual(count, 0)
            XCTAssertFalse(model.isStreaming)
        }
    }

    func testDeleteGuestHistoryDrainsPendingWritesAndKeepsThePublicDeck() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let cache = ChatCache(rootDirectory: folder)
        let scope = ChatCacheScope(environment: "https://test.invalid", userID: nil)
        let consent = AIConsentStore(scope: scope, defaults: nil)
        consent.grant()
        let api = ControlledChatAPI()
        let model = ChatViewModel(api: api, cache: cache, scope: scope, consent: consent)
        try await cache.saveDeck([], fetchedAt: Date())
        model.send("Guest-only words")
        try await eventually { await api.requestCount == 1 }
        await api.emit(.textDelta("Partial local answer"))
        try await eventually { model.messages.last?.text == "Partial local answer" }
        model.draft = "An unsent question"
        let deleted = try await model.deleteGuestHistory()
        XCTAssertTrue(deleted)
        await api.emit(.textDelta("Late words"))
        await Task.yield()
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertTrue(model.draft.isEmpty)
        let threads = try await cache.loadThreads(scope: scope)
        let deck = try await cache.loadDeck()
        XCTAssertTrue(threads.isEmpty)
        XCTAssertNotNil(deck)
        XCTAssertTrue(consent.isAllowed)
        await model.invalidateForAccountChange()
    }

    func testDeletionWinsAgainstAnOverlappingGuestPreservationBarrier() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let cache = ChatCache(rootDirectory: folder)
        let scope = ChatCacheScope(environment: "https://test.invalid", userID: nil)
        let consent = AIConsentStore(scope: scope, defaults: nil)
        consent.grant()
        let api = ControlledChatAPI()
        let model = ChatViewModel(api: api, cache: cache, scope: scope, consent: consent)
        model.send("A guest chat to delete")
        try await eventually { await api.requestCount == 1 }
        await api.emit(.textDelta("Guest-only answer"))
        try await eventually { model.messages.last?.text == "Guest-only answer" }
        let barrier = Task { await model.invalidateForAccountChange(preservingDraft: true) }
        await Task.yield()
        let deleted = try await model.deleteGuestHistory()
        await barrier.value
        XCTAssertTrue(deleted)
        let threads = try await cache.loadThreads(scope: scope)
        XCTAssertTrue(threads.isEmpty)
        await model.invalidateForAccountChange()
    }

    private func withModel(granted: Bool = true,
                           _ body: (ChatViewModel, ControlledChatAPI) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let api = ControlledChatAPI()
        let cache = ChatCache(rootDirectory: folder)
        let scope = ChatCacheScope(environment: "https://test.invalid", userID: nil)
        let consent = AIConsentStore(scope: scope, defaults: nil)
        if granted { consent.grant() }
        let model = ChatViewModel(api: api, cache: cache, scope: scope, consent: consent)
        do {
            try await body(model, api)
            await model.invalidateForAccountChange()
        } catch {
            await model.invalidateForAccountChange()
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
        try? FileManager.default.removeItem(at: folder)
    }

    private func eventually(_ condition: @MainActor () async -> Bool) async throws {
        for _ in 0..<100 {
            if await condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Controlled stream did not reach the expected state")
    }
}

private actor ControlledChatAPI: ChatStreamingAPI {
    private(set) var requestCount = 0
    private var continuation: AsyncThrowingStream<AgentEvent, Error>.Continuation?

    func streamChat(_ request: ChatRequest) async throws -> AsyncThrowingStream<AgentEvent, Error> {
        let pair = AsyncThrowingStream<AgentEvent, Error>.makeStream()
        requestCount += 1
        continuation = pair.continuation
        return pair.stream
    }
    func emit(_ event: AgentEvent) { continuation?.yield(event) }
    func finish() { continuation?.finish() }
}
