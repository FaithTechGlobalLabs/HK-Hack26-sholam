import Foundation
import XCTest
@testable import Shalom

/// Authored, not yet run (source-only stage). Needs an app unit-test target
/// with `@testable import Shalom`; no network, Keychain or Supabase calls.
final class AccountPolicyTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUp() {
        super.setUp()
        suiteName = "AccountPolicyTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    // MARK: AuthProblem.message

    func testEveryProblemHasCopyInBothModes() {
        let all: [AuthProblem] = [
            .emailLimit, .emailCooldown(seconds: 42), .emailCooldown(seconds: nil), .tooManyTries,
            .invalidEmail, .notAuthorized, .codeInvalid, .linkInvalid, .linkOtherDevice,
            .linkMissing, .signupsClosed, .network, .unknown,
        ]
        for problem in all {
            for codes in [true, false] {
                XCTAssertFalse(problem.message(codes: codes).isEmpty, "\(problem) codes=\(codes)")
            }
        }
    }

    func testCooldownCopyNamesTheWait() {
        XCTAssertTrue(AuthProblem.emailCooldown(seconds: 42).message(codes: true).contains("42 seconds"))
        XCTAssertTrue(AuthProblem.emailCooldown(seconds: nil).message(codes: false).contains("a minute"))
        XCTAssertTrue(AuthProblem.emailCooldown(seconds: 5).message(codes: true).contains("code"))
        XCTAssertTrue(AuthProblem.emailCooldown(seconds: 5).message(codes: false).contains("link"))
    }

    func testCooldownIsParsedFromRateLimitMessage() {
        let problem = AuthProblem.classify(code: "over_email_send_rate_limit", status: 429,
                                           message: "For security purposes, you can only request this after 37 seconds.",
                                           stage: .send)
        XCTAssertEqual(problem, .emailCooldown(seconds: 37))
    }

    // MARK: First-install Keychain cleanup

    func testFirstLaunchRemovesSessionsAndWritesMarker() {
        var removals = 0
        let outcome = AuthInstallMarker.prepare(defaults: defaults) { removals += 1; return true }
        XCTAssertEqual(outcome, .cleanedFirstLaunch)
        XCTAssertTrue(outcome.mayRestoreSession)
        XCTAssertEqual(removals, 1)
        XCTAssertTrue(defaults.bool(forKey: AuthInstallMarker.defaultsKey))
    }

    func testLaterLaunchesDoNotTouchTheKeychain() {
        _ = AuthInstallMarker.prepare(defaults: defaults) { true }
        var removals = 0
        let outcome = AuthInstallMarker.prepare(defaults: defaults) { removals += 1; return true }
        XCTAssertEqual(outcome, .existingInstall)
        XCTAssertTrue(outcome.mayRestoreSession)
        XCTAssertEqual(removals, 0)
    }

    func testFailedCleanupBlocksRestoreAndRetriesNextLaunch() {
        let failed = AuthInstallMarker.prepare(defaults: defaults) { false }
        XCTAssertEqual(failed, .cleanupFailed)
        XCTAssertFalse(failed.mayRestoreSession)
        XCTAssertFalse(defaults.bool(forKey: AuthInstallMarker.defaultsKey))
        var removals = 0
        let retried = AuthInstallMarker.prepare(defaults: defaults) { removals += 1; return true }
        XCTAssertEqual(retried, .cleanedFirstLaunch)
        XCTAssertEqual(removals, 1)
    }

    func testCleanupIsScopedToTheAppAuthService() {
        XCTAssertEqual(AuthKeychainScope.service, "com.owenisas.shalom.auth")
    }

    // MARK: Restored-session expiry

    func testExpiredRestoredSessionIsNotUsable() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let past = now.addingTimeInterval(-1).timeIntervalSince1970
        XCTAssertFalse(SessionRestorePolicy.isUsable(expiresAt: past, now: now))
    }

    func testSessionInsideLeewayIsNotUsable() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let soon = now.addingTimeInterval(SessionRestorePolicy.leeway - 1).timeIntervalSince1970
        XCTAssertFalse(SessionRestorePolicy.isUsable(expiresAt: soon, now: now))
    }

    func testValidRestoredSessionIsUsable() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let later = now.addingTimeInterval(3_600).timeIntervalSince1970
        XCTAssertTrue(SessionRestorePolicy.isUsable(expiresAt: later, now: now))
    }
}
