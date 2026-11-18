import Foundation
import ShalomCore
import XCTest
@testable import Shalom

@MainActor
final class AIConsentStoreTests: XCTestCase {
    func testPermissionIsDeniedUntilExplicitlyGrantedAndCanBeRevoked() {
        let scope = ChatCacheScope(environment: "https://one.invalid", userID: nil)
        let store = AIConsentStore(scope: scope, defaults: nil)
        XCTAssertFalse(store.isAllowed)
        store.grant()
        XCTAssertTrue(store.isAllowed)
        store.revoke()
        store.reload()
        XCTAssertFalse(store.isAllowed)
    }

    func testAccountsAndEnvironmentsDoNotSharePermission() {
        let guest = ChatCacheScope(environment: "https://one.invalid", userID: nil)
        let account = ChatCacheScope(environment: "https://one.invalid", userID: "account-a")
        let other = ChatCacheScope(environment: "https://two.invalid", userID: nil)
        let store = AIConsentStore(scope: guest, defaults: nil)
        store.grant()
        store.changeScope(account)
        XCTAssertFalse(store.isAllowed)
        store.grant()
        store.changeScope(other)
        XCTAssertFalse(store.isAllowed)
        store.changeScope(guest)
        XCTAssertTrue(store.isAllowed)
    }

    func testOnlyTheCurrentDisclosureRestoresPermission() throws {
        let suite = "ShalomConsentTests-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let scope = ChatCacheScope(environment: "https://consent-tests.invalid", userID: nil)
        let store = AIConsentStore(scope: scope, defaults: defaults)
        store.grant()
        XCTAssertTrue(AIConsentStore(scope: scope, defaults: defaults).isAllowed)
        let key = try XCTUnwrap(defaults.dictionaryRepresentation().keys.first { $0.hasPrefix("Shalom.ai-sharing.") })
        defaults.set("disclosure-0", forKey: key)
        XCTAssertFalse(AIConsentStore(scope: scope, defaults: defaults).isAllowed)
        defaults.set(true, forKey: key)
        XCTAssertFalse(AIConsentStore(scope: scope, defaults: defaults).isAllowed)
    }

    func testSupportEmailCannotInjectRecipientsOrHeaders() throws {
        XCTAssertEqual(NativeConfiguration.supportEmailAddress("owenisas@gmail.com"), "owenisas@gmail.com")
        XCTAssertEqual(NativeConfiguration.supportEmailAddress("support+qa@example.com"), "support+qa@example.com")
        for value in ["", "missing-at", "a@example.com?bcc=other@example.com", "a@example.com\r\nBcc:other@example.com",
                      "mailto:a@example.com", "a@example.com%0ABcc:other@example.com", ".a@example.com", "a..b@example.com"] {
            XCTAssertNil(NativeConfiguration.supportEmailAddress(value), value)
        }
        let configuration = NativeConfiguration(
            apiBaseURL: URL(string: "https://test.invalid")!, supabaseURL: nil, supabasePublishableKey: nil,
            signInMode: .disabled, authCallbackURL: URL(string: "shalom://auth/callback")!,
            billingEnabled: false, productIDs: [], supportEmail: "owenisas@gmail.com")
        let url = try XCTUnwrap(configuration.supportContactURL)
        let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
        XCTAssertEqual(components.scheme, "mailto")
        XCTAssertEqual(components.path, "owenisas@gmail.com")
        XCTAssertEqual(components.queryItems?.map(\.name), ["subject"])
        XCTAssertEqual(components.queryItems?.first?.value, "Shalom support")
        XCTAssertNil(components.queryItems?.first { $0.name == "body" })
        var withPage = configuration
        withPage.supportURL = URL(string: "https://example.com/support")
        XCTAssertEqual(withPage.supportContactURL?.scheme, "https")
    }

    func testPublicDocumentLinksFailClosed() {
        XCTAssertNil(NativeConfiguration.publicDocumentURL(nil))
        XCTAssertNil(NativeConfiguration.publicDocumentURL(""))
        XCTAssertNil(NativeConfiguration.publicDocumentURL("http://example.com/privacy"))
        XCTAssertNil(NativeConfiguration.publicDocumentURL("https://user:password@example.com/privacy"))
        XCTAssertNil(NativeConfiguration.publicDocumentURL("https://localhost/privacy"))
        XCTAssertEqual(NativeConfiguration.publicDocumentURL("https://example.com/privacy")?.host, "example.com")
    }
}
