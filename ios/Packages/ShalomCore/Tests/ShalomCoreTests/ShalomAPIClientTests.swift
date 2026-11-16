import Foundation
import XCTest
@testable import ShalomCore

/// In-process HTTP stub: no network, no real server, synthetic bodies only.
final class StubURLProtocol: URLProtocol {
    struct Reply: Sendable {
        var status = 200
        var headers: [String: String] = ["Content-Type": "application/json"]
        var chunks: [Data] = []
        /// false keeps the connection open (to test cancellation).
        var finishes = true
        /// Response URL override (to simulate landing on another origin).
        var url: URL?
        /// Answer with a redirect to this URL (`status` should be 3xx). The
        /// session delegate decides whether a second request is made.
        var redirectTo: URL?
        /// After the chunks, fail the load with this error instead of finishing.
        var failure: URLError.Code?
    }

    final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var replies: [Reply] = []
        private var _requests: [URLRequest] = []
        private var _bodies: [Data] = []
        private var _stops = 0
        private var activeProtocol: StubURLProtocol?
        private var stopWaiters: [XCTestExpectation] = []

        func reset(_ replies: [Reply]) {
            lock.withLock { self.replies = replies; _requests = []; _bodies = []; _stops = 0; stopWaiters = []; activeProtocol = nil }
        }
        func next(for request: URLRequest) -> Reply {
            let body = StubURLProtocol.body(of: request)
            return lock.withLock {
                _requests.append(request)
                _bodies.append(body)
                return replies.isEmpty ? Reply(status: 599) : replies.removeFirst()
            }
        }
        var bodies: [Data] { lock.withLock { _bodies } }
        func started(_ value: StubURLProtocol) { lock.withLock { activeProtocol = value } }
        func failCurrent(_ code: URLError.Code) {
            let target = lock.withLock { activeProtocol }
            if let target { target.client?.urlProtocol(target, didFailWithError: URLError(code)) }
        }
        func stopped() {
            let waiters = lock.withLock { _stops += 1; return stopWaiters }
            waiters.forEach { $0.fulfill() }
        }
        func onStop(_ expectation: XCTestExpectation) { lock.withLock { stopWaiters.append(expectation) } }
        var requests: [URLRequest] { lock.withLock { _requests } }
        var stops: Int { lock.withLock { _stops } }
    }

    static let state = State()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.state.started(self)
        let reply = Self.state.next(for: request)
        let url = reply.url ?? request.url!
        var headers = reply.headers
        if let target = reply.redirectTo { headers["Location"] = target.absoluteString }
        let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1",
                                       headerFields: headers)!
        if let target = reply.redirectTo {
            // Worst case for leakage: the follow-up carries every original
            // header, Authorization included. Only the session delegate
            // stands between this and a request to `target`.
            var next = URLRequest(url: target)
            next.httpMethod = request.httpMethod
            next.allHTTPHeaderFields = request.allHTTPHeaderFields
            client?.urlProtocol(self, wasRedirectedTo: next, redirectResponse: response)
            // When the delegate refuses, the 3xx itself is the final answer.
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        for chunk in reply.chunks { client?.urlProtocol(self, didLoad: chunk) }
        if let failure = reply.failure {
            client?.urlProtocol(self, didFailWithError: URLError(failure))
            return
        }
        if reply.finishes { client?.urlProtocolDidFinishLoading(self) }
    }

    /// The body as sent (URLSession may move `httpBody` into a stream).
    static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4_096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override func stopLoading() { Self.state.stopped() }
}

private struct FixedToken: AccessTokenProvider {
    let token: String?
    func accessToken() async throws -> String? { token }
}

private struct FailingToken: AccessTokenProvider {
    struct Expired: Error {}
    func accessToken() async throws -> String? { throw Expired() }
}

/// A token refresh that is itself cancelled, in the three shapes it can take.
private struct CancelledToken: AccessTokenProvider {
    enum Shape: Sendable { case cancellationError, urlCancelled, genericAfterTaskCancel }
    let shape: Shape
    struct RefreshAborted: Error {}
    func accessToken() async throws -> String? {
        switch shape {
        case .cancellationError:
            throw CancellationError()
        case .urlCancelled:
            throw URLError(.cancelled)
        case .genericAfterTaskCancel:
            // A refresh library that maps its own abort to a generic error.
            while !Task.isCancelled { try? await Task.sleep(nanoseconds: 10_000_000) }
            throw RefreshAborted()
        }
    }
}

final class ShalomAPIClientTests: XCTestCase {
    private let base = URL(string: "https://api.shalom.test")!
    /// A syntactically valid, meaningless JWT-shaped string (not a real token).
    private let fakeJWT = "aaaa.bbbb.cccc"

    override func setUp() {
        StubURLProtocol.state.reset([])
    }

    private func stubConfiguration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return config
    }

    private func client(token: String? = nil, base: URL? = nil) -> ShalomAPIClient {
        ShalomAPIClient(baseURL: base ?? self.base, tokenProvider: FixedToken(token: token),
                        configuration: stubConfiguration())
    }

    /// Holds the redirect decision handed to a completion handler.
    private final class DecisionBox: @unchecked Sendable {
        private let lock = NSLock()
        private var stored: URLRequest?
        func set(_ value: URLRequest?) { lock.withLock { stored = value } }
        var value: URLRequest? { lock.withLock { stored } }
    }

    private func sse(_ chunks: [Data], finishes: Bool = true) -> StubURLProtocol.Reply {
        StubURLProtocol.Reply(status: 200, headers: ["Content-Type": "text/event-stream; charset=utf-8"],
                              chunks: chunks, finishes: finishes)
    }

    private func chunked(_ data: Data, sizes: [Int]) -> [Data] {
        var out: [Data] = []; var index = 0; var turn = 0
        let bytes = [UInt8](data)
        while index < bytes.count {
            let end = min(bytes.count, index + sizes[turn % sizes.count])
            out.append(Data(bytes[index..<end])); index = end; turn += 1
        }
        return out
    }

    /// A cancelled consumer sees the stream end quietly, so the caller
    /// checks `Task.isCancelled` (as the app's Stop path must).
    private static func collect(_ stream: AsyncThrowingStream<AgentEvent, Error>) async -> ([AgentEvent], (any Error)?) {
        var events: [AgentEvent] = []
        do {
            for try await event in stream { events.append(event) }
            let ending: (any Error)? = Task.isCancelled ? CancellationError() : nil
            return (events, ending)
        } catch {
            return (events, error)
        }
    }

    private let request = ChatRequest(message: "Who was Ruth?", chatId: "11111111-1111-4111-8111-111111111111")

    // MARK: Streaming

    func testStreamYieldsFixtureEventsAcrossOddChunksAndEndsOnDone() async throws {
        let body = try Fixture.chatStream
        StubURLProtocol.state.reset([sse(chunked(body, sizes: [1, 5, 2, 64, 3]))])
        let api = client()
        let stream = try await api.streamChat(request)
        let (events, error) = await Self.collect(stream)
        XCTAssertNil(error)
        XCTAssertEqual(events.count, 10)
        XCTAssertEqual(events.last, .done(stopReason: "end_turn", messageId: "00000000-0000-4000-8000-000000000001",
                                          saved: true))
        let sent = try XCTUnwrap(StubURLProtocol.state.requests.first)
        XCTAssertEqual(sent.httpMethod, "POST")
        XCTAssertEqual(sent.url?.absoluteString, "https://api.shalom.test/api/chat")
        XCTAssertNil(sent.value(forHTTPHeaderField: "Authorization"), "guests send no Authorization")
        XCTAssertFalse(sent.httpShouldHandleCookies)
    }

    func testEOFWithoutDoneIsIncompleteNotSuccess() async throws {
        let partial = Fixture.frame("text_delta", #"{"text":"Ruth was"}"#)
            + Fixture.frame("citations", #"{"unverified":[],"quoteWarnings":[]}"#)
            + "event: done\ndata: {\"stopReason\":\"end_turn\"}\n" // no blank line
        StubURLProtocol.state.reset([sse([Data(partial.utf8)])])
        let api = client()
        let (events, error) = await Self.collect(try await api.streamChat(request))
        XCTAssertEqual(events.count, 2)
        XCTAssertEqual((error as? ShalomAPIError)?.kind, .incompleteStream)

        var message = ChatReducer.newAssistantMessage()
        events.forEach { ChatReducer.apply($0, to: &message) }
        ChatReducer.finish(&message, error: error)
        XCTAssertEqual(message.delivery, .incomplete)
        XCTAssertFalse(message.hasFinalCitationCheck)
    }

    func testErrorEventEndsTheStreamWithoutThrowing() async throws {
        StubURLProtocol.state.reset([sse([Data(Fixture.frame("error", #"{"message":"Model unavailable"}"#).utf8)])])
        let api = client()
        let (events, error) = await Self.collect(try await api.streamChat(request))
        XCTAssertNil(error)
        XCTAssertEqual(events, [.error("Model unavailable")])
    }

    func testStoppingCancelsTheURLSessionTask() async throws {
        let first = Data(Fixture.frame("text_delta", #"{"text":"first"}"#).utf8)
        StubURLProtocol.state.reset([sse([first], finishes: false)])
        let stopped = expectation(description: "stopLoading")
        stopped.assertForOverFulfill = false
        StubURLProtocol.state.onStop(stopped)
        let api = client()
        do {
            // The stream lives only in this scope: leaving it terminates it.
            let stream = try await api.streamChat(request)
            for try await event in stream {
                XCTAssertEqual(event, .textDelta("first"))
                break // Stop
            }
        }
        await fulfillment(of: [stopped], timeout: 5)
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1)
    }

    func testTaskCancellationIsReportedAsStopped() async throws {
        StubURLProtocol.state.reset([sse([Data(Fixture.frame("text_delta", #"{"text":"a"}"#).utf8)], finishes: false)])
        let api = client()
        let stream = try await api.streamChat(request)
        let consumer = Task { await ShalomAPIClientTests.collect(stream) }
        try await Task.sleep(nanoseconds: 200_000_000)
        consumer.cancel()
        let (_, error) = await consumer.value
        XCTAssertEqual(ChatReducer.streamEnd(for: error), .stopped)
        _ = api
    }

    func testRateLimitReportsRetryAfterAndIsNotRetried() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 429, headers: ["Content-Type": "application/json", "Retry-After": "1800"],
                                  chunks: [Data(#"{"error":"Please come back in a little while."}"#.utf8)]),
            sse([Data(Fixture.frame("done", #"{"stopReason":"end_turn"}"#).utf8)]),
        ])
        do {
            _ = try await client().streamChat(request)
            XCTFail("429 must throw")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .rateLimited)
            XCTAssertEqual(error.statusCode, 429)
            XCTAssertEqual(error.retryAfter, 1800)
            XCTAssertEqual(error.displayMessage, "Please come back in a little while.")
            XCTAssertFalse(error.errorDescription?.contains("little while") ?? true, "description is fixed copy")
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1, "a chat POST is never retried")
    }

    func testServerErrorBodiesAreBoundedAndNotDescribed() async throws {
        let huge = Data(repeating: UInt8(ascii: "x"), count: 200_000)
        StubURLProtocol.state.reset([StubURLProtocol.Reply(status: 502, headers: ["Content-Type": "text/html"],
                                                           chunks: [huge])])
        do {
            _ = try await client().streamChat(request)
            XCTFail("502 must throw")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .server)
            XCTAssertNil(error.serverMessage)
        }
    }

    func testNonEventStreamSuccessIsRejected() async throws {
        StubURLProtocol.state.reset([StubURLProtocol.Reply(status: 200, headers: ["Content-Type": "text/html"],
                                                           chunks: [Data("<html>portal</html>".utf8)])])
        do {
            _ = try await client().streamChat(request)
            XCTFail("HTML must not be parsed as events")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .invalidResponse)
        }
    }

    func testOversizedFrameEndsTheStream() async throws {
        let big = "event: text_delta\ndata: {\"text\":\"" + String(repeating: "a", count: ShalomAPIClient.maxStreamFrameBytes + 10)
        StubURLProtocol.state.reset([sse([Data(big.utf8)])])
        let api = client()
        let (_, error) = await Self.collect(try await api.streamChat(request))
        XCTAssertEqual((error as? ShalomAPIError)?.kind, .streamFrameTooLarge)
    }

    func testInvalidRequestsAreRefusedLocally() async {
        let api = client()
        for bad in [ChatRequest(message: "   ", chatId: "x"),
                    ChatRequest(message: String(repeating: "a", count: 8_001), chatId: "x"),
                    ChatRequest(message: "hi", chatId: ""),
                    ChatRequest(message: "hi", chatId: "x",
                                history: Array(repeating: HistoryTurn(role: .user, content: "q"), count: 201))] {
            do {
                _ = try await api.streamChat(bad)
                XCTFail("must be refused")
            } catch {
                XCTAssertEqual((error as? ShalomAPIError)?.kind, .invalidRequest)
            }
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 0)
    }

    // MARK: Origin and credentials

    func testBearerGoesOnlyToTheTrustedOriginAndNotOnTheDeck() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(chunks: [Data(#"{"enabled":true,"account":{"email":null,"displayName":"Ruth"},"canSave":true}"#.utf8)]),
            StubURLProtocol.Reply(chunks: [Data(#"{"cards":[]}"#.utf8)]),
        ])
        let api = client(token: fakeJWT)
        let account = try await api.fetchAccount()
        XCTAssertEqual(account.account?.displayName, "Ruth")
        let cards = try await api.fetchDeck()
        XCTAssertEqual(cards, [])
        let requests = StubURLProtocol.state.requests
        XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Authorization"), "Bearer \(fakeJWT)")
        XCTAssertNil(requests[1].value(forHTTPHeaderField: "Authorization"), "the public deck needs no token")
        XCTAssertEqual(requests[1].url?.absoluteString, "https://api.shalom.test/api/flashcards?limit=200")
    }

    func testMalformedOrFailingTokensAreNeverSent() async {
        for api in [client(token: "Bearer x\r\nX-Evil: 1"), client(token: "not-a-jwt"),
                    ShalomAPIClient(baseURL: base, tokenProvider: FailingToken(), configuration: {
                        let c = URLSessionConfiguration.ephemeral; c.protocolClasses = [StubURLProtocol.self]; return c
                    }())] {
            do {
                _ = try await api.fetchAccount()
                XCTFail("must not send")
            } catch {
                XCTAssertEqual((error as? ShalomAPIError)?.kind, .unauthorized)
            }
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 0)
    }

    func testUntrustedBaseURLsAreRefusedBeforeSending() async {
        for url in ["http://sholam.vercel.app", "https://user:pw@sholam.vercel.app", "ftp://sholam.vercel.app"] {
            let api = client(token: fakeJWT, base: URL(string: url)!)
            do {
                _ = try await api.fetchAccount()
                XCTFail("\(url) must be refused")
            } catch {
                XCTAssertEqual((error as? ShalomAPIError)?.kind, .invalidConfiguration)
            }
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 0)
    }

    func testResponsesFromAnotherOriginOrRedirectStatusAreRejected() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(chunks: [Data(#"{"cards":[]}"#.utf8)], url: URL(string: "https://evil.test/api/flashcards")),
            StubURLProtocol.Reply(status: 302, headers: ["Location": "https://evil.test/"]),
        ])
        let api = client(token: fakeJWT)
        for _ in 0..<2 {
            do {
                _ = try await api.fetchDeck()
                XCTFail("must be rejected")
            } catch {
                XCTAssertEqual((error as? ShalomAPIError)?.kind, .untrustedRedirect)
            }
        }
    }

    func testRedirectPolicyAllowsOnlySameOriginGETs() throws {
        let origin = try XCTUnwrap(TrustedOrigin(base))
        let policy = RedirectPolicy(origin: origin)
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let redirect = HTTPURLResponse(url: base, statusCode: 302, httpVersion: nil, headerFields: nil)!

        var get = URLRequest(url: base.appending(path: "api/account")); get.httpMethod = "GET"
        var post = URLRequest(url: base.appending(path: "api/chat")); post.httpMethod = "POST"
        let getTask = session.dataTask(with: get)   // never resumed
        let postTask = session.dataTask(with: post) // never resumed

        let same = URLRequest(url: base.appending(path: "api/account/"))
        let other = URLRequest(url: URL(string: "https://evil.test/api/account")!)
        let downgrade = URLRequest(url: URL(string: "http://api.shalom.test/api/account")!)
        XCTAssertNotNil(policy.redirectTarget(for: getTask, newRequest: same))
        XCTAssertNil(policy.redirectTarget(for: getTask, newRequest: other))
        XCTAssertNil(policy.redirectTarget(for: getTask, newRequest: downgrade))
        XCTAssertNil(policy.redirectTarget(for: postTask, newRequest: same))

        // The delegate entry point URLSession calls hands back the same decision.
        let decided = expectation(description: "completion handler called")
        let box = DecisionBox()
        policy.urlSession(session, task: getTask, willPerformHTTPRedirection: redirect, newRequest: other) {
            box.set($0); decided.fulfill()
        }
        wait(for: [decided], timeout: 1)
        XCTAssertNil(box.value)
    }

    // MARK: Redirects through a real URLSession (in-process URLProtocol)

    /// If the delegate method were not wired to URLSession, the default is
    /// to follow every redirect, and the stub would record a second request
    /// to evil.test carrying the bearer. This proves it is wired and refuses.
    func testCrossOriginRedirectSendsNoSecondRequest() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 302, redirectTo: URL(string: "https://evil.test/steal")),
            StubURLProtocol.Reply(chunks: [Data(#"{"enabled":true,"account":null,"canSave":true}"#.utf8)]),
        ])
        let api = client(token: fakeJWT)
        do {
            _ = try await api.fetchAccount()
            XCTFail("a cross-origin redirect must not succeed")
        } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .untrustedRedirect)
        }
        let requests = StubURLProtocol.state.requests
        XCTAssertEqual(requests.count, 1, "no second request after a refused redirect")
        XCTAssertFalse(requests.contains { $0.url?.host == "evil.test" })
        for sent in requests where sent.url?.host != base.host {
            XCTAssertNil(sent.value(forHTTPHeaderField: "Authorization"), "bearer must never leave the origin")
        }
    }

    func testDowngradeRedirectOnSameHostIsRefused() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 301, redirectTo: URL(string: "http://api.shalom.test/api/account")),
            StubURLProtocol.Reply(chunks: [Data(#"{"enabled":true,"account":null,"canSave":true}"#.utf8)]),
        ])
        do {
            _ = try await client(token: fakeJWT).fetchAccount()
            XCTFail("https → http must be refused")
        } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .untrustedRedirect)
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1)
        XCTAssertFalse(StubURLProtocol.state.requests.contains { $0.url?.scheme == "http" })
    }

    func testChatPOSTIsNeverRedirectedEvenWithinTheOrigin() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 307, redirectTo: URL(string: "https://api.shalom.test/api/chat2")),
            sse([Data(Fixture.frame("done", #"{"stopReason":"end_turn"}"#).utf8)]),
        ])
        do {
            _ = try await client(token: fakeJWT).streamChat(request)
            XCTFail("a redirected chat POST must not be resent")
        } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .untrustedRedirect)
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1, "the chat turn is sent once")
    }

    func testSameOriginGETRedirectIsFollowed() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 308, redirectTo: URL(string: "https://api.shalom.test/api/account/")),
            StubURLProtocol.Reply(chunks: [Data(#"{"enabled":true,"account":null,"canSave":true}"#.utf8)]),
        ])
        let account = try await client(token: fakeJWT).fetchAccount()
        XCTAssertTrue(account.enabled)
        let requests = StubURLProtocol.state.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.last?.url?.host, "api.shalom.test")
    }

    // MARK: Timeouts

    func testTimeoutsAllowLongQuietTurns() async throws {
        XCTAssertGreaterThanOrEqual(ShalomAPIClient.requestTimeout, 180)
        XCTAssertGreaterThanOrEqual(ShalomAPIClient.resourceTimeout, 330)
        XCTAssertLessThanOrEqual(ShalomAPIClient.resourceTimeout, 600, "still bounded")
        StubURLProtocol.state.reset([sse([Data(Fixture.frame("done", #"{"stopReason":"end_turn"}"#).utf8)])])
        _ = await Self.collect(try await client().streamChat(request))
        let sent = try XCTUnwrap(StubURLProtocol.state.requests.first)
        XCTAssertEqual(sent.timeoutInterval, ShalomAPIClient.requestTimeout, "not URLRequest's 60 s default")
    }

    func testChatTimeoutIsDistinctWarnsItMayBeSavedAndIsNotReplayed() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 200, headers: ["Content-Type": "text/event-stream"],
                                  chunks: [Data(Fixture.frame("text_delta", #"{"text":"Ruth"}"#).utf8)],
                                  finishes: false),
            sse([Data(Fixture.frame("done", #"{"stopReason":"end_turn"}"#).utf8)]),
        ])
        let stream = try await client().streamChat(request)
        var events: [AgentEvent] = []
        var error: (any Error)?
        do {
            for try await event in stream {
                events.append(event)
                // Timeout only after the consumer has received the first
                // frame; URLSession may drop an immediately failed buffer.
                StubURLProtocol.state.failCurrent(.timedOut)
            }
        } catch let failure { error = failure }
        XCTAssertEqual(events, [.textDelta("Ruth")])
        let problem = try XCTUnwrap(error as? ShalomAPIError)
        XCTAssertEqual(problem.kind, .answerTimedOut)
        XCTAssertTrue(problem.mayHaveBeenSaved)
        XCTAssertTrue(problem.displayMessage.contains("may still have been saved"))
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1, "never replayed")

        var message = ChatReducer.newAssistantMessage()
        events.forEach { ChatReducer.apply($0, to: &message) }
        ChatReducer.finish(&message, error: error)
        XCTAssertEqual(message.delivery, .failed)
        XCTAssertFalse(message.hasFinalCitationCheck)
    }

    func testTimeoutMappingIsChatSpecific() {
        XCTAssertEqual((ShalomAPIClient.mapTransportError(URLError(.timedOut), chatTurn: true) as? ShalomAPIError)?.kind,
                       .answerTimedOut)
        XCTAssertEqual((ShalomAPIClient.mapTransportError(URLError(.timedOut)) as? ShalomAPIError)?.kind, .network)
        XCTAssertFalse(ShalomAPIError(kind: .network).mayHaveBeenSaved)
    }

    // MARK: Token refresh cancellation

    func testCancelledTokenRefreshIsCancellationNotUnauthorized() async throws {
        for shape in [CancelledToken.Shape.cancellationError, .urlCancelled] {
            let api = ShalomAPIClient(baseURL: base, tokenProvider: CancelledToken(shape: shape),
                                      configuration: stubConfiguration())
            do {
                _ = try await api.streamChat(request)
                XCTFail("must not send")
            } catch {
                XCTAssertTrue(error is CancellationError, "\(shape): got \(error)")
                XCTAssertEqual(ChatReducer.streamEnd(for: error), .stopped)
            }
        }
        let api = ShalomAPIClient(baseURL: base, tokenProvider: CancelledToken(shape: .genericAfterTaskCancel),
                                  configuration: stubConfiguration())
        let task = Task { () -> (any Error)? in
            do { _ = try await api.fetchAccount(); return nil } catch { return error }
        }
        try await Task.sleep(nanoseconds: 50_000_000)
        task.cancel()
        let error = await task.value
        XCTAssertTrue(error is CancellationError, "got \(String(describing: error))")
        XCTAssertNotEqual((error as? ShalomAPIError)?.kind, .unauthorized)
        XCTAssertEqual(StubURLProtocol.state.requests.count, 0)
    }

    // MARK: Chat ids

    func testUUIDChatIDsAreSentAndReturnedLowercase() async throws {
        let upper = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"
        let lower = upper.lowercased()
        StubURLProtocol.state.reset([
            sse([Data(Fixture.frame("done", #"{"stopReason":"end_turn"}"#).utf8)]),
            StubURLProtocol.Reply(chunks: [Data(#"{"saved":["\#(upper)"],"skipped":[]}"#.utf8)]),
            StubURLProtocol.Reply(chunks: [Data(#"{"chats":[{"id":"\#(upper)","title":"T","updatedAt":"2026-11-01T00:00:00Z","messageCount":1}],"signedIn":true}"#.utf8)]),
        ])
        let api = client(token: fakeJWT)
        _ = await Self.collect(try await api.streamChat(ChatRequest(message: "Hi", chatId: upper)))
        let imported = try await api.importChats([ChatImportEntry(id: upper, title: "T", updatedAt: "2026-11-01T00:00:00Z",
                                                                  messages: [ChatImportMessage(role: .user, text: "Hi")])])
        let list = try await api.listChats()

        let bodies = StubURLProtocol.state.bodies
        struct ChatBody: Decodable { let chatId: String }
        XCTAssertEqual(try JSONDecoder().decode(ChatBody.self, from: bodies[0]).chatId, lower)
        let importBody = try JSONDecoder().decode(ChatImportRequest.self, from: bodies[1])
        XCTAssertEqual(importBody.chats.map(\.id), [lower])
        XCTAssertEqual(imported.saved, [lower])
        XCTAssertEqual(list.chats.map(\.id), [lower])
        XCTAssertEqual(ChatID.canonical("not-a-uuid"), "not-a-uuid")
        let made = ChatID.make()
        XCTAssertEqual(made, made.lowercased())
        XCTAssertNotNil(UUID(uuidString: made))
        XCTAssertTrue(ChatID.same(upper, lower))
    }

    // MARK: Display names and server text

    func testDisplayNameMatchesServerNormalisation() {
        XCTAssertEqual(DisplayName.normalized("  Ruth \t of\n\nMoab  "), "Ruth ofMoab")
        XCTAssertEqual(DisplayName.normalized("Ru\u{0}th\u{7F}"), "Ruth")
        XCTAssertEqual(DisplayName.normalized("Ruth\u{00A0}\u{3000}Naomi"), "Ruth Naomi")
        XCTAssertEqual(DisplayName.normalized("A\u{2028}B"), "A B")
        XCTAssertNil(DisplayName.normalized(" \u{0}\t\u{3000} "))
        XCTAssertEqual(DisplayName.normalized(String(repeating: "a", count: 40))?.utf16.count, 40)
        XCTAssertNil(DisplayName.normalized(String(repeating: "a", count: 41)))
        // 20 emoji = 40 UTF-16 units fits; 21 do not.
        XCTAssertNotNil(DisplayName.normalized(String(repeating: "🕊", count: 20)))
        XCTAssertNil(DisplayName.normalized(String(repeating: "🕊", count: 21)))
        // Long whitespace runs collapse before the length check, as on the server.
        XCTAssertEqual(DisplayName.normalized("a" + String(repeating: " ", count: 100) + "b"), "a b")
    }

    func testUpdateDisplayNameSendsNormalisedNameAndRefusesBadOnesLocally() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(chunks: [Data(#"{"enabled":true,"account":{"email":null,"displayName":"Ruth of Moab"},"canSave":true}"#.utf8)]),
        ])
        let api = client(token: fakeJWT)
        _ = try await api.updateDisplayName("  Ruth   of\tMoab ")
        struct NameBody: Decodable { let displayName: String }
        let sent = try JSONDecoder().decode(NameBody.self, from: try XCTUnwrap(StubURLProtocol.state.bodies.first))
        XCTAssertEqual(sent.displayName, "Ruth ofMoab")

        do {
            _ = try await api.updateDisplayName(String(repeating: "x", count: 41))
            XCTFail("must be refused locally")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .invalidRequest)
            XCTAssertEqual(error.displayMessage, DisplayName.invalidMessage)
        }
        XCTAssertEqual(StubURLProtocol.state.requests.count, 1)
    }

    func testOnlyAllowlistedBadRequestTextIsShown() {
        let friendly = ShalomAPIError.forStatus(400, retryAfter: nil, serverMessage: DisplayName.invalidMessage)
        XCTAssertEqual(friendly.displayMessage, DisplayName.invalidMessage)
        let developer = ShalomAPIError.forStatus(400, retryAfter: nil,
                                                 serverMessage: "Expected { message: string, chatId?: string, history?: [] }")
        XCTAssertEqual(developer.displayMessage, developer.errorDescription)
        let leaky = ShalomAPIError.forStatus(403, retryAfter: nil, serverMessage: "db host 10.0.0.1 rejected token eyJ…")
        XCTAssertEqual(leaky.displayMessage, leaky.errorDescription)
        XCTAssertNil(ShalomAPIError.forStatus(500, retryAfter: nil, serverMessage: "stack trace").serverMessage)
        let long = ShalomAPIError.sanitizedServerMessage(from: Data(#"{"error":"\#(String(repeating: "a", count: 5_000))"}"#.utf8))
        XCTAssertLessThanOrEqual(long?.utf16.count ?? 0, 300)
    }

    // MARK: Shipped contracts

    func testSignedOutChatListIsAValueAndRejectedTokenIsUnauthorized() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 401, chunks: [Data(#"{"chats":[],"signedIn":false}"#.utf8)]),
            StubURLProtocol.Reply(status: 401, headers: ["Content-Type": "application/json",
                                                         "WWW-Authenticate": "Bearer error=\"invalid_token\""],
                                  chunks: [Data(#"{"error":"Sign in again"}"#.utf8)]),
        ])
        let api = client()
        let list = try await api.listChats()
        XCTAssertFalse(list.signedIn)
        XCTAssertEqual(list.chats, [])
        do {
            _ = try await api.listChats()
            XCTFail("invalid token must throw")
        } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .unauthorized)
        }
    }

    func testLoadChatDecodesSavedEvidenceAndValidatesID() async throws {
        StubURLProtocol.state.reset([StubURLProtocol.Reply(chunks: [try Fixture.data("chat-document", "json")])])
        let api = client(token: fakeJWT)
        let document = try await api.loadChat(id: "11111111-1111-4111-8111-111111111111")
        XCTAssertEqual(document.messages.count, 4)
        XCTAssertEqual(StubURLProtocol.state.requests.first?.url?.path,
                       "/api/chats/11111111-1111-4111-8111-111111111111")
        do {
            _ = try await api.loadChat(id: "../account")
            XCTFail("non-UUID ids are refused")
        } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .invalidRequest)
        }
    }

    func testNotFoundAndDecodingFailures() async throws {
        StubURLProtocol.state.reset([
            StubURLProtocol.Reply(status: 404, chunks: [Data(#"{"error":"Not found"}"#.utf8)]),
            StubURLProtocol.Reply(chunks: [Data(#"{"cards":"nope"}"#.utf8)]),
        ])
        let api = client(token: fakeJWT)
        do { _ = try await api.loadChat(id: UUID().uuidString); XCTFail() } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .notFound)
        }
        do { _ = try await api.fetchDeck(); XCTFail() } catch {
            XCTAssertEqual((error as? ShalomAPIError)?.kind, .decoding)
        }
    }

    func testRetryAfterParsing() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertEqual(ShalomAPIError.parseRetryAfter("120", now: now), 120)
        XCTAssertEqual(ShalomAPIError.parseRetryAfter("999999", now: now), 86_400)
        XCTAssertNil(ShalomAPIError.parseRetryAfter("-5", now: now))
        XCTAssertNil(ShalomAPIError.parseRetryAfter("soon", now: now))
        let date = "Fri, 15 Jan 2027 08:00:30 GMT" // 1_800_000_030
        XCTAssertEqual(ShalomAPIError.parseRetryAfter(date, now: now), 30)
    }
}
