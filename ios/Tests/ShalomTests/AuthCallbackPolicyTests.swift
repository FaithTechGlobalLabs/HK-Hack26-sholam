import Foundation
import XCTest
@testable import Shalom

/// Authored, not run. Pure URL policy; no session exchange or email.
final class AuthCallbackPolicyTests: XCTestCase {
    private let expected = URL(string: "shalom://auth/callback")!

    func testOnlyExactNativeCallbackEndpointIsValid() {
        XCTAssertTrue(AuthCallbackValidator.isValid(URL(string: "shalom://auth/callback?code=pkce")!, expected: expected))
        XCTAssertFalse(AuthCallbackValidator.isValid(URL(string: "shalom://auth/other?code=pkce")!, expected: expected))
        XCTAssertFalse(AuthCallbackValidator.isValid(URL(string: "shalom://user@auth/callback?code=pkce")!, expected: expected))
        XCTAssertFalse(AuthCallbackValidator.isValid(URL(string: "https://auth/callback?code=pkce")!, expected: expected))
    }

    func testPKCECodeIsRequiredAndImplicitTokensAreRejected() {
        XCTAssertTrue(AuthCallbackValidator.hasCredentialParameters(URL(string: "shalom://auth/callback?code=pkce")!))
        XCTAssertFalse(AuthCallbackValidator.hasCredentialParameters(URL(string: "shalom://auth/callback?code=")!))
        XCTAssertFalse(AuthCallbackValidator.hasCredentialParameters(URL(string: "shalom://auth/callback#access_token=untrusted")!))
        XCTAssertFalse(AuthCallbackValidator.hasCredentialParameters(URL(string: "shalom://auth/callback?code=pkce&refresh_token=untrusted")!))
        XCTAssertFalse(AuthCallbackValidator.hasCredentialParameters(URL(string: "shalom://auth/callback?code=a&code=b")!))
    }
}
