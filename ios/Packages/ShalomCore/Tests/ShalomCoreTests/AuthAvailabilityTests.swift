import Foundation
import XCTest
@testable import ShalomCore

/// Authored, not run. Provider failures happen before any URL request.
final class AuthAvailabilityTests: XCTestCase {
    func testTemporaryAuthFailureIsNotInvalidCredentials() async throws {
        let api = ShalomAPIClient(baseURL: URL(string: "https://test.invalid")!,
                                  tokenProvider: FailedTokenProvider(failure: .unavailable))
        do {
            _ = try await api.fetchAccount()
            XCTFail("Expected a retryable provider error")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .authenticationUnavailable)
            XCTAssertEqual(error.statusCode, 503)
            XCTAssertNotEqual(error.displayMessage, "Please sign in again.")
        }
    }

    func testRejectedSessionDoesNotBecomeGuest() async throws {
        let api = ShalomAPIClient(baseURL: URL(string: "https://test.invalid")!,
                                  tokenProvider: FailedTokenProvider(failure: .rejected))
        do {
            _ = try await api.fetchAccount()
            XCTFail("Expected rejected credentials")
        } catch let error as ShalomAPIError {
            XCTAssertEqual(error.kind, .unauthorized)
        }
    }
}

private struct FailedTokenProvider: AccessTokenProvider {
    let failure: AccessTokenProviderFailure
    func accessToken() async throws -> String? { throw failure }
}
