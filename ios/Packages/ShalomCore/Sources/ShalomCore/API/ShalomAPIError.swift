import Foundation

/// Every failure the API client reports. Descriptions are fixed copy: they
/// never include auth tokens, URLs with credentials or upstream bodies.
public struct ShalomAPIError: Error, LocalizedError, Equatable, Sendable {
    public enum Kind: String, Equatable, Sendable {
        case invalidConfiguration
        case invalidRequest
        case offline
        case network
        case cancelled
        case invalidResponse
        case responseTooLarge
        case untrustedRedirect
        case badRequest
        case unauthorized
        case authenticationUnavailable
        case forbidden
        case notFound
        case notImplemented
        case rateLimited
        case unavailable
        case server
        case decoding
        /// The chat stream closed before its `done` event.
        case incompleteStream
        case streamFrameTooLarge
        /// A chat turn went quiet past the client's limits after it was
        /// sent. The server may still have finished and saved the answer, so
        /// the turn must not be replayed automatically (`mayHaveBeenSaved`).
        case answerTimedOut
    }

    public let kind: Kind
    public let statusCode: Int?
    /// Seconds from a 429/503 `Retry-After` header, when present.
    public let retryAfter: TimeInterval?
    /// The server's short JSON `{ "error": "…" }` text for 4xx answers,
    /// sanitised and capped. Not used in `errorDescription`.
    public let serverMessage: String?

    public init(kind: Kind, statusCode: Int? = nil, retryAfter: TimeInterval? = nil,
                serverMessage: String? = nil) {
        self.kind = kind; self.statusCode = statusCode
        self.retryAfter = retryAfter; self.serverMessage = serverMessage
    }

    public var errorDescription: String? {
        switch kind {
        case .invalidConfiguration: "Shalom isn't set up correctly on this device."
        case .invalidRequest: "That request couldn't be sent."
        case .offline: "You're offline. Check your connection and try again."
        case .network: "Shalom couldn't reach the server. Please try again."
        case .cancelled: "Stopped."
        case .invalidResponse, .decoding: "Shalom received an answer it couldn't read."
        case .responseTooLarge, .streamFrameTooLarge: "The answer was too large to show."
        case .untrustedRedirect: "The server sent the request somewhere unexpected, so it was stopped."
        case .badRequest: "Shalom couldn't accept that message."
        case .unauthorized: "Please sign in again."
        case .authenticationUnavailable: "Your sign-in is being checked. Check your connection and try again shortly."
        case .forbidden: "That isn't allowed."
        case .notFound: "That chat wasn't found."
        case .notImplemented: "That isn't available yet."
        case .rateLimited: "Shalom has answered as many questions as it can for now. Please try again later."
        case .unavailable: "That isn't available right now."
        case .server: "Shalom had a problem answering. Please try again."
        case .incompleteStream: "The answer was cut off before it finished."
        case .answerTimedOut:
            "Shalom stopped waiting for this answer. It may still have been saved, so check your history before asking again."
        }
    }

    /// The request may already have been acted on by the server (a chat turn
    /// that timed out). Never resend it automatically; refresh history instead.
    public var mayHaveBeenSaved: Bool { kind == .answerTimedOut }

    /// Text for the UI. The server's own words are shown only where they are
    /// known to be friendly: rate-limit copy (it says when the limit resets)
    /// and the allowlisted bad-request texts in `friendlyBadRequestMessages`.
    /// Anything else falls back to the fixed `errorDescription`.
    public var displayMessage: String {
        if let serverMessage, !serverMessage.isEmpty {
            switch kind {
            case .rateLimited:
                return serverMessage
            case .badRequest, .invalidRequest:
                if Self.friendlyBadRequestMessages.contains(serverMessage) { return serverMessage }
            default:
                break
            }
        }
        return errorDescription ?? "Something went wrong."
    }

    /// Server 400 texts written for people (not for developers). Others,
    /// such as the chat route's schema hint, are never shown.
    static let friendlyBadRequestMessages: Set<String> = [DisplayName.invalidMessage]

    static func forStatus(_ status: Int, retryAfter: TimeInterval?, serverMessage: String?) -> ShalomAPIError {
        let kind: Kind = switch status {
        case 300..<400: .untrustedRedirect
        case 400, 413, 422: .badRequest
        case 401: .unauthorized
        case 403: .forbidden
        case 404: .notFound
        case 429: .rateLimited
        case 501: .notImplemented
        case 503: .unavailable
        case 500...599: .server
        default: .invalidResponse
        }
        return ShalomAPIError(kind: kind, statusCode: status, retryAfter: retryAfter,
                              serverMessage: (400..<500).contains(status) ? serverMessage : nil)
    }

    /// `Retry-After` as delta-seconds or an HTTP-date, capped at one day.
    static func parseRetryAfter(_ value: String?, now: Date = Date()) -> TimeInterval? {
        guard let raw = value?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
        if let seconds = Int(raw) { return seconds >= 0 ? TimeInterval(min(seconds, 86_400)) : nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let date = formatter.date(from: raw) else { return nil }
        return min(max(0, date.timeIntervalSince(now)), 86_400)
    }

    /// `{ "error": "…" }` from a bounded body: printable text only, ≤ 300 units.
    static func sanitizedServerMessage(from data: Data) -> String? {
        struct Body: Decodable { let error: String? }
        guard let text = (try? JSONDecoder().decode(Body.self, from: data))?.error else { return nil }
        let cleaned = String(String.UnicodeScalarView(text.unicodeScalars.filter {
            !CharacterSet.controlCharacters.contains($0)
        })).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }
        return HistoryPolicy.clip(cleaned, maxUTF16: 300)
    }
}
