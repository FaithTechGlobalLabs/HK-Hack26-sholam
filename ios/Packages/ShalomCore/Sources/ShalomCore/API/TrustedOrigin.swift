import Foundation

/// The single origin (scheme, host, port) the client talks to and the only
/// one that may receive the bearer token. HTTPS, or HTTP for loopback hosts
/// (DEBUG builds choose those in `NativeConfiguration`).
struct TrustedOrigin: Equatable, Sendable {
    let scheme: String
    let host: String
    let port: Int

    init?(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(), !host.isEmpty,
              url.user == nil, url.password == nil else { return nil }
        let loopback = ["localhost", "127.0.0.1", "::1"].contains(host)
        guard scheme == "https" || (scheme == "http" && loopback) else { return nil }
        self.scheme = scheme
        self.host = host
        self.port = url.port ?? (scheme == "https" ? 443 : 80)
    }

    func matches(_ url: URL?) -> Bool {
        guard let url, let other = TrustedOrigin(url) else { return false }
        return other == self
    }
}

/// Session delegate: a redirect is followed only for GET requests and only
/// within the trusted origin. Anything else is refused, and the client then
/// sees the 3xx response and reports `untrustedRedirect`.
///
/// Uses the documented completion-handler form of
/// `urlSession(_:task:willPerformHTTPRedirection:newRequest:completionHandler:)`
/// so the Objective-C selector match is unambiguous. If this method were
/// ever not called, URLSession would follow every redirect by default;
/// `ShalomAPIClientTests.testCrossOriginRedirectSendsNoSecondRequest`
/// would then see a request reach the other origin.
final class RedirectPolicy: NSObject, URLSessionTaskDelegate, Sendable {
    let origin: TrustedOrigin
    init(origin: TrustedOrigin) { self.origin = origin }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(redirectTarget(for: task, newRequest: request))
    }

    /// The request to follow, or nil to refuse (the 3xx is then delivered).
    func redirectTarget(for task: URLSessionTask, newRequest request: URLRequest) -> URLRequest? {
        let method = (task.originalRequest?.httpMethod ?? "GET").uppercased()
        guard method == "GET",
              origin.matches(task.originalRequest?.url),
              origin.matches(request.url),
              (request.httpMethod ?? "GET").uppercased() == "GET"
        else { return nil }
        return request
    }
}

/// Lets a non-Sendable value move into exactly one task that owns it.
struct UncheckedTransfer<Value>: @unchecked Sendable {
    let value: Value
}
