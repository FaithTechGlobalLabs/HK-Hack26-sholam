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

    private func withModel(_ body: (ChatViewModel, ControlledChatAPI) async throws -> Void) async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let api = ControlledChatAPI()
        let cache = ChatCache(rootDirectory: folder)
        let model = ChatViewModel(api: api, cache: cache,
            scope: ChatCacheScope(environment: "https://test.invalid", userID: nil))
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
