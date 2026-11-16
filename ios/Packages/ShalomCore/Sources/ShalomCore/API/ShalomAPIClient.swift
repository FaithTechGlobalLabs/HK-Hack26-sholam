import Foundation

/// Client for the website's existing API (`src/app/api/`). Ephemeral session
/// with no cookies, caches or credential storage; the bearer token comes
/// from `tokenProvider` per request and is attached only to the trusted
/// origin. Nothing is retried automatically, a chat POST least of all.
public actor ShalomAPIClient {
    public static let maxResponseBytes = 8 << 20
    public static let maxErrorBodyBytes = 16 << 10
    public static let maxStreamFrameBytes = 1 << 20
    /// The deck route's own cap (`DECK_LIMIT`).
    static let deckLimit = 200
    static let maxImportChats = 30
    static let maxImportMessages = 200
    static let maxAuthorizationTokenLength = 4_000
    /// Longest quiet gap allowed between bytes. A live chat turn can go
    /// silent while tools and the model work (and the server sends no
    /// keep-alive), so this is well above any expected pause.
    public static let requestTimeout: TimeInterval = 180
    /// Hard cap on a whole request, chat stream included (a little above
    /// the server function's own lifetime).
    public static let resourceTimeout: TimeInterval = 330

    public nonisolated let baseURL: URL
    private let origin: TrustedOrigin?
    private let tokenProvider: any AccessTokenProvider
    private let session: URLSession

    public init(baseURL: URL, tokenProvider: any AccessTokenProvider = GuestTokenProvider()) {
        self.init(baseURL: baseURL, tokenProvider: tokenProvider, configuration: .ephemeral)
    }

    /// Tests inject `protocolClasses`; the privacy settings are always reapplied.
    init(baseURL: URL, tokenProvider: any AccessTokenProvider, configuration: URLSessionConfiguration) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        let origin = TrustedOrigin(baseURL)
        self.origin = origin
        let config = configuration
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = Self.requestTimeout
        config.timeoutIntervalForResource = Self.resourceTimeout
        config.waitsForConnectivity = false
        // A placeholder origin keeps the delegate non-optional; requests are
        // refused before sending when the configured URL was not trusted.
        let policy = RedirectPolicy(origin: origin ?? TrustedOrigin(URL(string: "https://invalid.invalid")!)!)
        self.session = URLSession(configuration: config, delegate: policy, delegateQueue: nil)
    }

    /// In-flight streams keep running until they end or are terminated;
    /// the session is then released.
    deinit { session.finishTasksAndInvalidate() }

    // MARK: Public API (frozen in ios/README.md)

    public func fetchDeck() async throws -> [Flashcard] {
        let request = try await makeRequest(path: "api/flashcards", method: "GET",
                                            query: [URLQueryItem(name: "limit", value: String(Self.deckLimit))],
                                            authenticated: false)
        return try await send(request, as: DeckResponse.self).cards
    }

    public func fetchAccount() async throws -> AccountResponse {
        try await send(try await makeRequest(path: "api/account", method: "GET"), as: AccountResponse.self)
    }

    /// Sends the name normalised exactly as the server does (`DisplayName`).
    /// A name the server would refuse throws `.invalidRequest` whose
    /// `displayMessage` is the server's own "Use 1 to 40 characters…" text.
    public func updateDisplayName(_ name: String) async throws -> AccountResponse {
        guard let normalized = DisplayName.normalized(name) else {
            throw ShalomAPIError(kind: .invalidRequest, serverMessage: DisplayName.invalidMessage)
        }
        let body = try JSONEncoder().encode(["displayName": normalized])
        return try await send(try await makeRequest(path: "api/account", method: "PATCH", body: body),
                              as: AccountResponse.self)
    }

    /// Signed out, the route answers 401 with `{ chats: [], signedIn: false }`;
    /// that is returned as a value. A rejected token is `.unauthorized`.
    /// Chat ids come back in lowercase (`ChatID.canonical`).
    public func listChats() async throws -> ChatListResponse {
        let request = try await makeRequest(path: "api/chats", method: "GET")
        let (data, response) = try await Self.load(session: session, request: request, origin: origin)
        if response.statusCode == 401,
           let signedOut = try? JSONDecoder().decode(ChatListResponse.self, from: data),
           !signedOut.signedIn {
            return signedOut
        }
        var list = try Self.decode(ChatListResponse.self, data: data, response: response)
        for index in list.chats.indices { list.chats[index].id = ChatID.canonical(list.chats[index].id) }
        return list
    }

    public func loadChat(id: String) async throws -> ChatDocumentResponse {
        guard UUID(uuidString: id) != nil else { throw ShalomAPIError(kind: .invalidRequest) }
        var document = try await send(try await makeRequest(path: "api/chats/\(ChatID.canonical(id))", method: "GET"),
                                      as: ChatDocumentResponse.self)
        document.chat.id = ChatID.canonical(document.chat.id)
        return document
    }

    /// Ids are sent, and returned in `saved`/`skipped`, in lowercase.
    public func importChats(_ entries: [ChatImportEntry]) async throws -> ChatImportResponse {
        guard (1...Self.maxImportChats).contains(entries.count),
              entries.allSatisfy({ entry in
                  UUID(uuidString: entry.id) != nil && entry.title.utf16.count <= 200
                      && entry.updatedAt.utf16.count <= 40
                      && entry.messages.count <= Self.maxImportMessages
                      && entry.messages.allSatisfy { $0.text.utf16.count <= HistoryPolicy.maxRequestHistoryItemCharacters }
              })
        else { throw ShalomAPIError(kind: .invalidRequest) }
        let canonical = entries.map { entry -> ChatImportEntry in
            var copy = entry
            copy.id = ChatID.canonical(entry.id)
            return copy
        }
        let body = try JSONEncoder().encode(ChatImportRequest(chats: canonical))
        var result = try await send(try await makeRequest(path: "api/chats/import", method: "POST", body: body),
                                    as: ChatImportResponse.self)
        result.saved = result.saved.map(ChatID.canonical)
        result.skipped = result.skipped.map(ChatID.canonical)
        return result
    }

    /// Opens one chat turn. HTTP failures (429 with `retryAfter`, 401, …)
    /// throw here. The returned stream yields events until `done` or
    /// `error`; it throws `.incompleteStream` if the connection ends first,
    /// and `.answerTimedOut` (`mayHaveBeenSaved`) if it goes quiet past
    /// `requestTimeout` or runs past `resourceTimeout`.
    /// Ending iteration early (Stop, task cancellation, dropping the stream)
    /// cancels the URLSession task. Never retried automatically.
    /// A UUID `chatId` is sent in lowercase.
    public func streamChat(_ request: ChatRequest) async throws -> AsyncThrowingStream<AgentEvent, Error> {
        let message = request.message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, message.utf16.count <= HistoryPolicy.maxMessageCharacters,
              !request.chatId.isEmpty, request.chatId.utf16.count <= 100,
              request.history.count <= HistoryPolicy.maxRequestHistoryItems,
              request.history.allSatisfy({ $0.content.utf16.count <= HistoryPolicy.maxRequestHistoryItemCharacters })
        else { throw ShalomAPIError(kind: .invalidRequest) }
        var outgoing = request
        outgoing.chatId = ChatID.canonical(request.chatId)
        let body = try JSONEncoder().encode(outgoing)
        var urlRequest = try await makeRequest(path: "api/chat", method: "POST", body: body)
        urlRequest.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        return try await Self.openStream(session: session, request: urlRequest, origin: origin)
    }

    // MARK: Requests

    private func makeRequest(path: String, method: String, query: [URLQueryItem] = [],
                             body: Data? = nil, authenticated: Bool = true) async throws -> URLRequest {
        guard let origin else { throw ShalomAPIError(kind: .invalidConfiguration) }
        var url = baseURL.appending(path: path)
        if !query.isEmpty {
            guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
                throw ShalomAPIError(kind: .invalidConfiguration)
            }
            components.queryItems = query
            guard let withQuery = components.url else { throw ShalomAPIError(kind: .invalidConfiguration) }
            url = withQuery
        }
        guard origin.matches(url) else { throw ShalomAPIError(kind: .invalidConfiguration) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        // URLRequest defaults to 60 s, which would cut a quiet chat turn short.
        request.timeoutInterval = Self.requestTimeout
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token = try await currentToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        try Task.checkCancellation()
        return request
    }

    /// A fresh token from the provider, shape-checked (three base64url
    /// segments) so nothing else can be injected into the header.
    private func currentToken() async throws -> String? {
        let token: String?
        do {
            token = try await tokenProvider.accessToken()
        } catch {
            // A cancelled refresh (Stop, sign-out, view gone) is cancellation,
            // never "please sign in again".
            if Self.isCancellation(error) || Task.isCancelled { throw CancellationError() }
            if let failure = error as? AccessTokenProviderFailure, case .unavailable = failure {
                throw ShalomAPIError(kind: .authenticationUnavailable, statusCode: 503, retryAfter: 5)
            }
            throw ShalomAPIError(kind: .unauthorized)
        }
        try Task.checkCancellation()
        guard let token, !token.isEmpty else { return nil }
        guard Self.isJWTShaped(token) else { throw ShalomAPIError(kind: .unauthorized) }
        return token
    }

    static func isJWTShaped(_ token: String) -> Bool {
        guard token.utf8.count <= maxAuthorizationTokenLength else { return false }
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 3 && parts.allSatisfy { part in
            !part.isEmpty && part.utf8.allSatisfy { byte in
                (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5A)
                    || (byte >= 0x61 && byte <= 0x7A) || byte == 0x2D || byte == 0x5F
            }
        }
    }

    private func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await Self.load(session: session, request: request, origin: origin)
        return try Self.decode(type, data: data, response: response)
    }

    // MARK: Transport (nonisolated: URLSession's byte streams stay off the actor)

    private static func decode<T: Decodable>(_ type: T.Type, data: Data, response: HTTPURLResponse) throws -> T {
        guard (200..<300).contains(response.statusCode) else {
            throw ShalomAPIError.forStatus(response.statusCode, retryAfter: retryAfter(response),
                                           serverMessage: ShalomAPIError.sanitizedServerMessage(from: data))
        }
        guard isJSON(response) else { throw ShalomAPIError(kind: .invalidResponse, statusCode: response.statusCode) }
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw ShalomAPIError(kind: .decoding, statusCode: response.statusCode)
        }
    }

    /// One bounded request: success bodies up to `maxResponseBytes`, error
    /// bodies truncated at `maxErrorBodyBytes`.
    private static func load(session: URLSession, request: URLRequest,
                             origin: TrustedOrigin?) async throws -> (Data, HTTPURLResponse) {
        let (bytes, http) = try await open(session: session, request: request, origin: origin)
        let success = (200..<300).contains(http.statusCode)
        let limit = success ? maxResponseBytes : maxErrorBodyBytes
        if success, http.expectedContentLength > Int64(limit) {
            bytes.task.cancel()
            throw ShalomAPIError(kind: .responseTooLarge, statusCode: http.statusCode)
        }
        let data = try await readBounded(bytes, limit: limit, truncate: !success)
        return (data, http)
    }

    private static func open(session: URLSession, request: URLRequest, origin: TrustedOrigin?,
                             chatTurn: Bool = false) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        let result: (URLSession.AsyncBytes, URLResponse)
        do {
            result = try await session.bytes(for: request)
        } catch {
            throw mapTransportError(error, chatTurn: chatTurn)
        }
        let (bytes, response) = result
        guard let http = response as? HTTPURLResponse else {
            bytes.task.cancel()
            throw ShalomAPIError(kind: .invalidResponse)
        }
        // A refused redirect surfaces as the 3xx itself; any final URL off
        // the trusted origin is refused too.
        if (300..<400).contains(http.statusCode) || !(origin?.matches(http.url) ?? false) {
            bytes.task.cancel()
            throw ShalomAPIError(kind: .untrustedRedirect, statusCode: http.statusCode)
        }
        return (bytes, http)
    }

    private static func readBounded(_ bytes: URLSession.AsyncBytes, limit: Int, truncate: Bool) async throws -> Data {
        var data = Data()
        data.reserveCapacity(min(limit, 64 << 10))
        do {
            for try await byte in bytes {
                if data.count >= limit {
                    bytes.task.cancel()
                    if truncate { break }
                    throw ShalomAPIError(kind: .responseTooLarge)
                }
                data.append(byte)
            }
        } catch let error as ShalomAPIError {
            throw error
        } catch {
            throw mapTransportError(error)
        }
        return data
    }

    private static func openStream(session: URLSession, request: URLRequest,
                                   origin: TrustedOrigin?) async throws -> AsyncThrowingStream<AgentEvent, Error> {
        let (bytes, http) = try await open(session: session, request: request, origin: origin, chatTurn: true)
        guard (200..<300).contains(http.statusCode) else {
            let body = (try? await readBounded(bytes, limit: maxErrorBodyBytes, truncate: true)) ?? Data()
            bytes.task.cancel()
            throw ShalomAPIError.forStatus(http.statusCode, retryAfter: retryAfter(http),
                                           serverMessage: ShalomAPIError.sanitizedServerMessage(from: body))
        }
        let contentType = (http.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
        guard contentType.hasPrefix("text/event-stream") else {
            bytes.task.cancel()
            throw ShalomAPIError(kind: .invalidResponse, statusCode: http.statusCode)
        }

        let dataTask = bytes.task
        let transfer = UncheckedTransfer(value: bytes)
        return AsyncThrowingStream { continuation in
            let pump = Task {
                var decoder = AgentEventDecoder(maxFrameBytes: ShalomAPIClient.maxStreamFrameBytes)
                do {
                    for try await byte in transfer.value {
                        guard let event = try decoder.push(byte: byte) else { continue }
                        continuation.yield(event)
                        if event.isTerminal {
                            dataTask.cancel()
                            continuation.finish()
                            return
                        }
                    }
                    // EOF without done/error: never reported as success.
                    decoder.finish()
                    let failure: any Error = Task.isCancelled
                        ? CancellationError() as any Error : ShalomAPIError(kind: .incompleteStream)
                    continuation.finish(throwing: failure)
                } catch is SSEParserError {
                    dataTask.cancel()
                    continuation.finish(throwing: ShalomAPIError(kind: .streamFrameTooLarge))
                } catch {
                    dataTask.cancel()
                    let failure: any Error = Task.isCancelled
                        ? CancellationError() as any Error
                        : ShalomAPIClient.mapTransportError(error, chatTurn: true)
                    continuation.finish(throwing: failure)
                }
            }
            continuation.onTermination = { _ in
                pump.cancel()
                dataTask.cancel()
            }
        }
    }

    private static func isJSON(_ response: HTTPURLResponse) -> Bool {
        (response.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased().hasPrefix("application/json")
    }

    private static func retryAfter(_ response: HTTPURLResponse) -> TimeInterval? {
        guard response.statusCode == 429 || response.statusCode == 503 else { return nil }
        return ShalomAPIError.parseRetryAfter(response.value(forHTTPHeaderField: "Retry-After"))
    }

    static func isCancellation(_ error: any Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        if let api = error as? ShalomAPIError, api.kind == .cancelled { return true }
        return false
    }

    /// `chatTurn`: the failure belongs to a sent chat POST, so a timeout
    /// becomes `.answerTimedOut` (the server may still have saved it).
    static func mapTransportError(_ error: any Error, chatTurn: Bool = false) -> any Error {
        if error is CancellationError || error is ShalomAPIError { return error }
        guard let url = error as? URLError else { return ShalomAPIError(kind: .network) }
        switch url.code {
        case .cancelled:
            return ShalomAPIError(kind: .cancelled)
        case .timedOut where chatTurn:
            return ShalomAPIError(kind: .answerTimedOut)
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
             .internationalRoamingOff, .callIsActive:
            return ShalomAPIError(kind: .offline)
        case .appTransportSecurityRequiresSecureConnection, .unsupportedURL:
            return ShalomAPIError(kind: .invalidConfiguration)
        case .httpTooManyRedirects, .redirectToNonExistentLocation:
            return ShalomAPIError(kind: .untrustedRedirect)
        default:
            return ShalomAPIError(kind: .network)
        }
    }
}
