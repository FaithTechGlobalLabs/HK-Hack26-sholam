import Foundation
import Observation
import Security
import ShalomCore
import Supabase

/// Native sign-in state over supabase-swift 2.55.6.
///
/// - With `signInMode == .disabled` (the shipped configuration) no Supabase
///   client is ever constructed: no email can be requested, no callback can be
///   exchanged and `accessToken()` returns nil. Everyone is a free guest.
/// - Sessions live only in the SDK's Keychain storage. This type never writes,
///   logs or displays a token; `accessToken()` hands one to the caller. Its
///   only direct Keychain call deletes this app's own auth service items.
/// - A fresh installation first removes any session a previous installation
///   left in this app's own Keychain service, even with sign-in disabled.
/// - A restored session whose access token has expired is not shown as
///   signed in until it has been refreshed.
/// - Before a different user is adopted or the current one is cleared, the
///   store awaits `beforeSessionChange` so the lead can drain streams and
///   cache work; token requests are cancelled meanwhile, never downgraded
///   to guest requests. The change then bumps
///   `sessionRevision`, which drives the lead's new-scope reload.
@MainActor
@Observable
final class AuthStore: AccessTokenProvider {
    enum SignInStep: Equatable {
        case email
        case code(email: String)
        case linkSent(email: String)
    }

    // Frozen interface (ios/README.md).
    private(set) var userID: String?
    private(set) var account: Account?
    private(set) var isBusy = false
    var notice: String?
    private(set) var sessionRevision = 0

    // Additive state for AccountScreen.
    let configuration: NativeConfiguration
    private(set) var signInStep: SignInStep = .email
    private(set) var resendAvailableAt: Date?
    /// `canSave` from the last `/api/account` response for this user.
    private(set) var canSaveProfile = false
    /// nil until checked; false when the server answered but did not
    /// recognize this native session (e.g. a server version without app
    /// Bearer sign-in deployed yet). Rechecked by `refreshAccount`.
    private(set) var serverRecognizesSession: Bool?
    /// True while a restored, expired session waits for a refresh. The person
    /// is shown as a guest meanwhile.
    private(set) var isRestoringSession = false

    /// Lead hook, awaited on the main actor BEFORE adopting a different user
    /// and BEFORE clearing the current one (sign-out or a signed-out event).
    /// Drain chat streams and cache writes here. Not called when the same
    /// user's token is merely refreshed.
    @ObservationIgnored var beforeSessionChange: (@MainActor () async -> Void)?

    var isSignInAvailable: Bool { configuration.canSignIn }
    var usesEmailCodes: Bool { configuration.signInMode == .emailCode }
    var needsDisplayName: Bool {
        userID != nil && serverRecognizesSession == true && canSaveProfile && account?.displayName == nil
    }

    @ObservationIgnored private var client: SupabaseClient?
    @ObservationIgnored private let lifetime = AuthTaskLifetime()
    @ObservationIgnored private var started = false
    /// Bumped by sign-out. Work that began under an older epoch is discarded.
    @ObservationIgnored private var epoch = 0
    /// False after an explicit sign-out until a new sign-in succeeds, so late
    /// SDK events cannot restore the signed-out state.
    @ObservationIgnored private var acceptsSessionEvents = true
    @ObservationIgnored private var lastSentEmail: String?
    /// Session changes waiting on `beforeSessionChange`. Tokens are withheld
    /// while this is non-zero.
    @ObservationIgnored private var transitionsInFlight = 0
    /// The user an in-flight adoption is switching to (latest wins).
    @ObservationIgnored private var adoptingUserID: String?
    @ObservationIgnored private var restoreInFlight = false
    private let defaults: UserDefaults

    init(configuration: NativeConfiguration, defaults: UserDefaults = .standard) {
        self.configuration = configuration
        self.defaults = defaults
    }

    /// Removes a previous installation's session (first launch only), then
    /// restores a Keychain session if sign-in is configured. Never requests an
    /// email. Safe to call more than once.
    func start() async {
        guard !started else { return }
        started = true
        // Runs whatever the sign-in mode, so a later build that enables
        // sign-in cannot pick up a session from a deleted installation.
        let install = AuthInstallMarker.prepare(defaults: defaults,
                                                removeStoredSessions: AuthKeychain.removeStoredSessions)
        guard install.mayRestoreSession else { return }
        if configuration.signInMode == .disabled {
            // An earlier enabled build may have left a refresh token behind.
            // Delete only this app's scoped service; construct no auth client.
            _ = AuthKeychain.removeStoredSessions()
            return
        }
        guard let client = makeClientIfConfigured() else { return }
        self.client = client
        lifetime.replace(Task { @MainActor [weak self] in
            // `.initialSession` is emitted first, from Keychain storage.
            for await (event, session) in client.auth.authStateChanges {
                guard !Task.isCancelled, let self else { return }
                await self.receive(event, session, client: client)
            }
        })
    }

    /// Resume hook (scene became active): retries refreshing a restored,
    /// expired session that could not be refreshed earlier (e.g. offline).
    func resume() async {
        guard isRestoringSession, let client, userID == nil else { return }
        await refreshRestoredSession(client)
    }

    /// Teardown: stops observing auth events. Also happens on deinit.
    func stop() {
        lifetime.cancel()
    }

    // MARK: AccessTokenProvider

    func accessToken() async throws -> String? {
        guard transitionsInFlight == 0 else { throw CancellationError() }
        if isRestoringSession {
            if let client, !restoreInFlight {
                // Refresh out of band. Awaiting an adoption from this token
                // request would deadlock the before-session-change barrier,
                // which waits for this chat request to finish cancelling.
                Task { @MainActor [weak self] in await self?.refreshRestoredSession(client) }
            }
            throw AccessTokenProviderFailure.unavailable
        }
        guard let client, let expectedUser = userID else { return nil }
        let startEpoch = epoch
        do {
            let session = try await client.auth.session // refreshes when expired
            guard transitionsInFlight == 0, startEpoch == epoch, userID == expectedUser,
                  Self.id(of: session) == expectedUser else { throw CancellationError() }
            return session.accessToken
        } catch {
            if Task.isCancelled || error is CancellationError
                || (error as? URLError)?.code == .cancelled {
                throw CancellationError()
            }
            // An account request must fail rather than silently becoming a
            // guest request when a session disappears or cannot be refreshed.
            if let authError = error as? AuthError, case .sessionMissing = authError {
                throw AccessTokenProviderFailure.rejected
            }
            throw AccessTokenProviderFailure.unavailable
        }
    }

    // MARK: Sign-in (only reachable when configured)

    func requestSignIn(email raw: String) async {
        guard let client, configuration.canSignIn, configuration.signInMode != .disabled else {
            notice = Self.unavailableNotice
            return
        }
        guard !isBusy, userID == nil else { return }
        guard let email = EmailPolicy.normalize(raw) else {
            notice = AuthProblem.invalidEmail.message(codes: usesEmailCodes)
            return
        }
        if email == lastSentEmail, let resendAvailableAt, resendAvailableAt > Date() {
            let seconds = Int(resendAvailableAt.timeIntervalSinceNow.rounded(.up))
            notice = AuthProblem.emailCooldown(seconds: seconds).message(codes: usesEmailCodes)
            return
        }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        let startEpoch = epoch
        do {
            switch configuration.signInMode {
            case .emailCode:
                try await client.auth.signInWithOTP(email: email, shouldCreateUser: true)
            case .magicLink:
                try await client.auth.signInWithOTP(
                    email: email, redirectTo: configuration.authCallbackURL, shouldCreateUser: true)
            case .disabled:
                return
            }
            guard startEpoch == epoch else { return }
            markSent(to: email, wait: EmailPolicy.resendGap)
        } catch {
            guard startEpoch == epoch else { return }
            let problem = AuthProblem.classify(error, stage: .send)
            // A cooldown means an email went out moments ago; its code/link works.
            if case .emailCooldown(let seconds) = problem {
                markSent(to: email, wait: TimeInterval(seconds ?? Int(EmailPolicy.resendGap)))
            }
            notice = problem.message(codes: usesEmailCodes)
        }
    }

    func resend() async {
        switch signInStep {
        case .code(let email), .linkSent(let email): await requestSignIn(email: email)
        case .email: break
        }
    }

    func verifyCode(_ raw: String) async {
        guard let client, configuration.canSignIn, configuration.signInMode == .emailCode,
              case .code(let email) = signInStep, !isBusy else { return }
        let code = EmailPolicy.normalizeCode(raw)
        guard code.count == EmailPolicy.codeLength else {
            notice = "Enter the \(EmailPolicy.codeLength)-digit code from the email."
            return
        }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        let startEpoch = epoch
        do {
            let response = try await client.auth.verifyOTP(email: email, token: code, type: .email)
            guard startEpoch == epoch else { return await discardStaleSession(client) }
            guard case .session(let session) = response else {
                notice = AuthProblem.unknown.message(codes: true)
                return
            }
            await completeSignIn(with: session, startEpoch: startEpoch)
        } catch {
            guard startEpoch == epoch else { return }
            notice = AuthProblem.classify(error, stage: .verify).message(codes: true)
        }
    }

    /// Back to the email step (e.g. "Use a different email").
    func restartSignIn() {
        guard !isBusy else { return }
        signInStep = .email
        notice = nil
    }

    /// Exchanges `shalom://auth/callback` from a sign-in email (magicLink mode
    /// only). Other URLs are ignored; nothing is exchanged when sign-in is off.
    func handleCallback(_ url: URL) async {
        guard AuthCallbackValidator.isValid(url, expected: configuration.authCallbackURL) else { return }
        // A cold-launch URL can arrive before the root's startup task.
        if !started { await start() }
        guard let client, configuration.canSignIn, configuration.signInMode == .magicLink else {
            notice = "Signing in from an email link isn't turned on in this version of the app. You can keep using Shalom as a guest."
            return
        }
        guard userID == nil else {
            notice = "You're already signed in. Sign out first to use a different account."
            return
        }
        if let redirect = AuthCallbackValidator.redirectError(in: url) {
            notice = AuthProblem.classify(code: redirect.code, status: nil,
                                          message: redirect.description, stage: .link)
                .message(codes: false)
            return
        }
        guard AuthCallbackValidator.hasCredentialParameters(url) else {
            notice = AuthProblem.linkMissing.message(codes: false)
            return
        }
        guard !isBusy else { return }
        isBusy = true
        notice = nil
        defer { isBusy = false }
        let startEpoch = epoch
        do {
            let session = try await client.auth.session(from: url)
            guard startEpoch == epoch else { return await discardStaleSession(client) }
            await completeSignIn(with: session, startEpoch: startEpoch)
        } catch {
            guard startEpoch == epoch else { return }
            notice = AuthProblem.classify(error, stage: .link).message(codes: false)
        }
    }

    /// Signs out of this device only (`.local` scope). Late sign-ins and SDK
    /// events are invalidated immediately; `beforeSessionChange` is awaited
    /// before local state clears, and the SDK session is removed after that.
    func signOut() async {
        epoch += 1
        let signOutEpoch = epoch
        acceptsSessionEvents = false
        adoptingUserID = nil
        isRestoringSession = false
        signInStep = .email
        resendAvailableAt = nil
        lastSentEmail = nil
        if userID != nil || account != nil {
            transitionsInFlight += 1
            await beforeSessionChange?()
            transitionsInFlight -= 1
        }
        // A newer sign-out started during the hook and owns the rest.
        guard signOutEpoch == epoch else { return }
        applySignedOut()
        guard let client else { return }
        // The SDK removes the Keychain session before its network call, so a
        // failure here (e.g. offline) still leaves this device signed out.
        try? await client.auth.signOut(scope: .local)
    }

    // MARK: Account (shared API client)

    func refreshAccount(using api: ShalomAPIClient) async {
        guard let requestedUser = userID else { return }
        let revision = sessionRevision
        do {
            let response = try await api.fetchAccount()
            guard revision == sessionRevision, userID == requestedUser else { return }
            canSaveProfile = response.canSave
            if let remote = response.account {
                account = remote
                serverRecognizesSession = true
            } else {
                serverRecognizesSession = false
            }
        } catch {
            guard revision == sessionRevision, !(error is CancellationError), !Task.isCancelled else { return }
            notice = "We couldn't load your account. Check your connection and try again."
        }
    }

    /// Saves a display name via `PATCH /api/account`. Returns true on success.
    @discardableResult
    func saveDisplayName(_ raw: String, using api: ShalomAPIClient) async -> Bool {
        guard let requestedUser = userID, !isBusy else { return false }
        guard let name = DisplayNamePolicy.normalize(raw) else {
            notice = "Use 1 to \(DisplayNamePolicy.maxLength) characters for your name."
            return false
        }
        let revision = sessionRevision
        isBusy = true
        notice = nil
        defer { isBusy = false }
        do {
            let response = try await api.updateDisplayName(name)
            guard revision == sessionRevision, userID == requestedUser else { return false }
            if let remote = response.account { account = remote }
            canSaveProfile = response.canSave
            return true
        } catch {
            guard revision == sessionRevision else { return false }
            notice = "We couldn't save your name. Try again."
            return false
        }
    }

    // MARK: Private

    static let unavailableNotice =
        "Signing in isn't available in this version of the app. Chat and flashcards are free to use without an account."

    private func makeClientIfConfigured() -> SupabaseClient? {
        guard configuration.canSignIn, configuration.signInMode != .disabled,
              let url = configuration.supabaseURL, url.scheme == "https",
              let key = configuration.supabasePublishableKey, !key.isEmpty
        else { return nil }
        let options = SupabaseClientOptions(
            auth: .init(
                storage: KeychainLocalStorage(service: AuthKeychainScope.service),
                // Code mode leaves the email's link pointing at the website.
                redirectToURL: configuration.signInMode == .magicLink ? configuration.authCallbackURL : nil,
                flowType: .pkce,
                autoRefreshToken: true,
                emitLocalSessionAsInitialSession: true
            )
        )
        return SupabaseClient(supabaseURL: url, supabaseKey: key, options: options)
    }

    private func receive(_ event: AuthChangeEvent, _ session: Session?,
                         client: SupabaseClient) async {
        switch event {
        case .signedOut, .userDeleted:
            await clearAfterSignedOutEvent()
        case .initialSession:
            guard let session, acceptsSessionEvents else { return }
            if SessionRestorePolicy.isUsable(expiresAt: session.expiresAt) {
                await adopt(session)
            } else {
                // Expired in storage: stay a guest until a refresh succeeds.
                isRestoringSession = true
                Task { @MainActor [weak self] in
                    await self?.refreshRestoredSession(client)
                }
            }
        default:
            guard let session, acceptsSessionEvents else { return }
            isRestoringSession = false
            await adopt(session)
        }
    }

    /// `client.auth.session` refreshes an expired stored session. Only a
    /// refreshed session is adopted; on failure the person stays a guest.
    private func refreshRestoredSession(_ client: SupabaseClient) async {
        guard !restoreInFlight else { return }
        restoreInFlight = true
        defer { restoreInFlight = false }
        let startEpoch = epoch
        do {
            let session = try await client.auth.session
            guard startEpoch == epoch, acceptsSessionEvents, isRestoringSession else { return }
            guard SessionRestorePolicy.isUsable(expiresAt: session.expiresAt) else { return }
            isRestoringSession = false
            await adopt(session)
        } catch {
            guard startEpoch == epoch, isRestoringSession else { return }
            if AuthProblem.classify(error, stage: .verify) == .network {
                // Keep waiting; `resume()` retries.
                notice = "We couldn't refresh your sign-in. Check your connection. Shalom will try again when you come back."
            } else {
                // Missing or rejected session: this device is signed out.
                isRestoringSession = false
            }
        }
    }

    private func completeSignIn(with session: Session, startEpoch: Int) async {
        guard startEpoch == epoch, let client else { return }
        acceptsSessionEvents = true
        isRestoringSession = false
        signInStep = .email
        resendAvailableAt = nil
        lastSentEmail = nil
        await adopt(session)
        // Signed out while the lead drained: remove what the SDK stored.
        if startEpoch != epoch { await discardStaleSession(client) }
    }

    /// Adopts `session` if it belongs to a different user, after awaiting
    /// `beforeSessionChange`. A sign-out or a newer switch during the hook wins.
    private func adopt(_ session: Session) async {
        let id = Self.id(of: session)
        guard id != userID, adoptingUserID != id else { return }
        let startEpoch = epoch
        adoptingUserID = id
        transitionsInFlight += 1
        await beforeSessionChange?()
        transitionsInFlight -= 1
        guard adoptingUserID == id else { return }
        adoptingUserID = nil
        guard startEpoch == epoch, acceptsSessionEvents, id != userID else { return }
        apply(session)
    }

    /// The SDK reported the session ended (e.g. refresh token revoked).
    private func clearAfterSignedOutEvent() async {
        isRestoringSession = false
        guard userID != nil || account != nil else {
            applySignedOut()
            return
        }
        epoch += 1
        let clearEpoch = epoch
        adoptingUserID = nil
        transitionsInFlight += 1
        await beforeSessionChange?()
        transitionsInFlight -= 1
        guard clearEpoch == epoch else { return }
        applySignedOut()
    }

    private func apply(_ session: Session) {
        let id = Self.id(of: session)
        guard id != userID else { return }
        userID = id
        account = Account(email: session.user.email, displayName: nil)
        canSaveProfile = false
        serverRecognizesSession = nil
        sessionRevision += 1
    }

    private func applySignedOut() {
        canSaveProfile = false
        serverRecognizesSession = nil
        guard userID != nil || account != nil else { return }
        userID = nil
        account = nil
        sessionRevision += 1
    }

    private func markSent(to email: String, wait: TimeInterval) {
        lastSentEmail = email
        resendAvailableAt = Date().addingTimeInterval(wait)
        signInStep = configuration.signInMode == .emailCode ? .code(email: email) : .linkSent(email: email)
    }

    /// A sign-in finished after the person signed out: remove what the SDK stored.
    private func discardStaleSession(_ client: SupabaseClient) async {
        try? await client.auth.signOut(scope: .local)
    }

    /// Supabase user IDs are lowercase UUIDs (the web's `claims.sub`).
    private static func id(of session: Session) -> String {
        session.user.id.uuidString.lowercased()
    }
}

/// Removes this app's own native sign-in items: generic passwords under
/// `AuthKeychainScope.service` only. No other service, account or access
/// group is touched.
enum AuthKeychain {
    static func removeStoredSessions() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: AuthKeychainScope.service,
            kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}

enum AuthStoreError: Error, LocalizedError {
    case sessionUnavailable
    var errorDescription: String? {
        "Your sign-in couldn't be refreshed. Check your connection and try again."
    }
}

/// Owns the auth-state observation task; cancels it on replace, explicit
/// teardown or deallocation (the store's deinit releases this object).
private final class AuthTaskLifetime: @unchecked Sendable {
    private let lock = NSLock()
    private var task: Task<Void, Never>?

    func replace(_ newTask: Task<Void, Never>) {
        lock.withLock {
            task?.cancel()
            task = newTask
        }
    }

    func cancel() {
        lock.withLock {
            task?.cancel()
            task = nil
        }
    }

    deinit { task?.cancel() }
}
