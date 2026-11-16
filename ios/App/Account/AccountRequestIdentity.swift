import ShalomCore

/// Tokens may be issued only for the account whose cache/UI scope has already
/// been committed by ApplicationModel. This closes the redraw gap between an
/// SDK identity change and SwiftUI's asynchronous scope-reload handler.
@MainActor
final class AccountRequestIdentity: AccessTokenProvider {
    private let auth: AuthStore
    var expectedUserID: String?
    init(auth: AuthStore) { self.auth = auth }

    func accessToken() async throws -> String? {
        let expected = expectedUserID
        guard auth.userID == expected else { throw CancellationError() }
        let token = try await auth.accessToken()
        guard expectedUserID == expected, auth.userID == expected else { throw CancellationError() }
        return token
    }
}
