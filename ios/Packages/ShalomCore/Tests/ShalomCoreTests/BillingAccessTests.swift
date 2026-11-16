import Foundation
import XCTest
@testable import ShalomCore

/// Records every store interaction and how many times a store was constructed.
final class SpyStoreClient: StoreClient, @unchecked Sendable {
    private let lock = NSLock()
    private var _calls: [String] = []
    private var _listening = false
    private var _owned: Set<VerifiedEntitlement> = []
    private var _onStart: (@Sendable () async -> Void)?
    var purchaseResult: Result<PurchaseOutcome, BillingError> = .success(.cancelled)

    var calls: [String] { lock.withLock { _calls } }
    /// Whether a listener is running in this fake store right now.
    var isListening: Bool { lock.withLock { _listening } }
    var ownedProducts: Set<VerifiedEntitlement> {
        get { lock.withLock { _owned } }
        set { lock.withLock { _owned = newValue } }
    }
    /// Runs inside `startListening` before the listener takes effect, to
    /// model a stop/kill racing a slow startup.
    var onStart: (@Sendable () async -> Void)? {
        get { lock.withLock { _onStart } }
        set { lock.withLock { _onStart = newValue } }
    }
    private func record(_ call: String) { lock.withLock { _calls.append(call) } }

    func products(for ids: [String]) async throws -> [StoreProduct] {
        record("products")
        return ids.map { StoreProduct(id: $0, displayName: "Test \($0)", displayPrice: "test") }
    }
    func purchase(productID: String) async throws -> PurchaseOutcome {
        record("purchase")
        return try purchaseResult.get()
    }
    func restore() async throws -> Set<VerifiedEntitlement> { record("restore"); return ownedProducts }
    func currentEntitlements() async -> Set<VerifiedEntitlement> {
        record("currentEntitlements"); return ownedProducts
    }
    func startListening(onUpdate: @escaping @Sendable (Set<VerifiedEntitlement>) async -> Void) async {
        record("startListening")
        if let onStart { await onStart() }
        lock.withLock { _listening = true }
    }
    func stopListening() async {
        record("stopListening")
        lock.withLock { _listening = false }
    }
}

/// Counts factory invocations so tests prove no adapter is constructed.
final class StoreFactorySpy: @unchecked Sendable {
    private let lock = NSLock()
    private var _made = 0
    let store = SpyStoreClient()
    var made: Int { lock.withLock { _made } }
    func make() -> any StoreClient {
        lock.withLock { _made += 1 }
        return store
    }
}

/// Settable clock for expiry tests.
final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var _now: Date
    init(_ start: Date) { _now = start }
    var now: Date {
        get { lock.withLock { _now } }
        set { lock.withLock { _now = newValue } }
    }
}

final class BillingAccessTests: XCTestCase {
    // Test-only identifiers; not App Store product IDs.
    private let testProduct = "test.only.product"
    private let start = Date(timeIntervalSince1970: 1_800_000_000)

    private func assertFreeAndInert(_ configuration: BillingConfiguration,
                                    signal: ServerBillingSignal = .noChange,
                                    file: StaticString = #filePath, line: UInt = #line) async {
        let factory = StoreFactorySpy()
        let coordinator = BillingCoordinator(configuration: configuration,
                                             premiumFeatures: Set(BillingFeature.allCases),
                                             makeStore: { factory.make() })
        await coordinator.apply(signal)

        for feature in BillingFeature.allCases {
            let granted = await coordinator.hasAccess(to: feature)
            XCTAssertTrue(granted, "\(feature) must be free", file: file, line: line)
            let checked = await coordinator.checkAccess(to: feature)
            XCTAssertTrue(checked, "\(feature) must be free at the gate", file: file, line: line)
        }
        let paywall = await coordinator.shouldPresentPaywall
        XCTAssertFalse(paywall, file: file, line: line)
        await coordinator.revalidate()

        await assertDisabled(file: file, line: line) { _ = try await coordinator.loadProducts() }
        await assertDisabled(file: file, line: line) { _ = try await coordinator.purchase(productID: self.testProduct) }
        await assertDisabled(file: file, line: line) { try await coordinator.restore() }
        await assertDisabled(file: file, line: line) { try await coordinator.refreshEntitlements() }
        await assertDisabled(file: file, line: line) { try await coordinator.startListening() }
        await coordinator.stopListening()

        XCTAssertEqual(factory.made, 0, "no store adapter may be constructed", file: file, line: line)
        XCTAssertEqual(factory.store.calls, [], "no store calls when billing is off", file: file, line: line)
    }

    private func assertDisabled(file: StaticString, line: UInt,
                                _ body: () async throws -> Void) async {
        do {
            try await body()
            XCTFail("expected billingDisabled", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? BillingError, .billingDisabled, file: file, line: line)
        }
    }

    private func enabledCoordinator(_ factory: StoreFactorySpy,
                                    clock: TestClock? = nil) -> BillingCoordinator {
        let clock = clock ?? TestClock(start)
        return BillingCoordinator(
            configuration: BillingConfiguration(isEnabled: true, productIDs: [testProduct]),
            premiumFeatures: [.chatHistory], makeStore: { factory.make() },
            now: { clock.now })
    }

    func testDisabledConfigurationGrantsEverythingWithZeroStoreCalls() async {
        await assertFreeAndInert(.disabled)
    }

    func testDisabledFlagWithProductsStaysOff() async {
        await assertFreeAndInert(BillingConfiguration(isEnabled: false, productIDs: [testProduct]))
    }

    func testMissingProductsStaysOff() async {
        await assertFreeAndInert(BillingConfiguration(isEnabled: true, productIDs: []))
        await assertFreeAndInert(BillingConfiguration(isEnabled: true, productIDs: ["", "  "]))
    }

    func testServerKillSwitchDisablesAnEnabledBuild() async {
        await assertFreeAndInert(BillingConfiguration(isEnabled: true, productIDs: [testProduct]),
                                 signal: .killSwitch)
    }

    func testServerSignalCannotEnableAnOffBuild() {
        for signal in [ServerBillingSignal.noChange, .killSwitch] {
            XCTAssertFalse(BillingConfiguration.disabled.applying(signal).isActive)
            XCTAssertTrue(AccessPolicy(configuration: .disabled, serverSignal: signal,
                                       premiumFeatures: Set(BillingFeature.allCases)).isFreeMode)
        }
    }

    func testKillAfterListeningStopsListenerAndLaterNoChangeDoesNotReenable() async throws {
        let factory = StoreFactorySpy()
        let coordinator = BillingCoordinator(
            configuration: BillingConfiguration(isEnabled: true, productIDs: [testProduct]),
            makeStore: { factory.make() })
        try await coordinator.startListening()
        await coordinator.apply(.killSwitch)
        await coordinator.apply(.noChange)
        XCTAssertEqual(factory.store.calls, ["startListening", "stopListening"])
        XCTAssertFalse(factory.store.isListening)
        do {
            _ = try await coordinator.loadProducts()
            XCTFail("expected billingDisabled")
        } catch {
            XCTAssertEqual(error as? BillingError, .billingDisabled)
        }
        XCTAssertEqual(factory.store.calls, ["startListening", "stopListening"])
    }

    func testKillSwitchDuringListenerStartupStopsTheStore() async throws {
        let factory = StoreFactorySpy()
        let coordinator = enabledCoordinator(factory)
        // The kill lands while the store is still starting, before its
        // listener exists, so the coordinator must stop it afterwards.
        factory.store.onStart = { await coordinator.apply(.killSwitch) }
        try await coordinator.startListening()
        XCTAssertFalse(factory.store.isListening, "listener must not survive a kill during startup")
        XCTAssertEqual(factory.store.calls.last, "stopListening")
        let free = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertTrue(free, "killed billing is free")
    }

    func testStopDuringListenerStartupStopsTheStore() async throws {
        let factory = StoreFactorySpy()
        let coordinator = enabledCoordinator(factory)
        factory.store.onStart = { await coordinator.stopListening() }
        try await coordinator.startListening()
        XCTAssertFalse(factory.store.isListening)
        XCTAssertEqual(factory.store.calls.last, "stopListening")
    }

    func testFreePolicyDefaults() {
        let policy = AccessPolicy.free
        XCTAssertTrue(policy.isFreeMode)
        XCTAssertFalse(policy.shouldPresentPaywall)
        XCTAssertTrue(BillingFeature.allCases.allSatisfy(policy.hasAccess(to:)))
    }

    // Future enabled mode (exercised with a spy only; never live).

    func testEnabledFailureDoesNotGrantPremium() async {
        let factory = StoreFactorySpy()
        factory.store.purchaseResult = .failure(.unverifiedTransaction)
        let coordinator = enabledCoordinator(factory)
        do {
            _ = try await coordinator.purchase(productID: testProduct)
            XCTFail("expected failure")
        } catch {}
        let access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertFalse(access)
        let free = await coordinator.hasAccess(to: .flashcards)
        XCTAssertTrue(free, "non-premium features stay free")
    }

    func testEnabledUnverifiedOrPendingOutcomeDoesNotGrant() async throws {
        for outcome in [PurchaseOutcome.unverified, .pending, .cancelled] {
            let factory = StoreFactorySpy()
            factory.store.purchaseResult = .success(outcome)
            let coordinator = enabledCoordinator(factory)
            _ = try await coordinator.purchase(productID: testProduct)
            let access = await coordinator.hasAccess(to: .chatHistory)
            XCTAssertFalse(access, "\(outcome) must not grant")
        }
    }

    func testEnabledVerifiedPurchaseOfUnlistedProductDoesNotGrant() async throws {
        let factory = StoreFactorySpy()
        factory.store.purchaseResult = .success(.purchased(productID: "test.other"))
        factory.store.ownedProducts = [VerifiedEntitlement(productID: "test.other")]
        let coordinator = enabledCoordinator(factory)
        _ = try await coordinator.purchase(productID: testProduct)
        let access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertFalse(access)
    }

    func testVerifiedPurchaseGrantsOnlyWhatTheStoreReports() async throws {
        let factory = StoreFactorySpy()
        factory.store.purchaseResult = .success(.purchased(productID: testProduct))
        let coordinator = enabledCoordinator(factory)
        // Outcome alone grants nothing: the store has no entitlement yet.
        _ = try await coordinator.purchase(productID: testProduct)
        var access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertFalse(access)
        factory.store.ownedProducts = [VerifiedEntitlement(productID: testProduct,
                                                           expiresAt: start.addingTimeInterval(60))]
        _ = try await coordinator.purchase(productID: testProduct)
        access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertTrue(access)
        XCTAssertEqual(factory.store.calls, ["purchase", "currentEntitlements",
                                             "purchase", "currentEntitlements"])
    }

    func testCachedSubscriptionExpiresWithoutAStoreRead() async throws {
        let factory = StoreFactorySpy()
        let clock = TestClock(start)
        factory.store.ownedProducts = [VerifiedEntitlement(productID: testProduct,
                                                           expiresAt: start.addingTimeInterval(60))]
        let coordinator = enabledCoordinator(factory, clock: clock)
        try await coordinator.refreshEntitlements()
        var access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertTrue(access)
        clock.now = start.addingTimeInterval(61)
        access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertFalse(access, "an expired cached subscription must not grant")
        let paywall = await coordinator.shouldPresentPaywall
        XCTAssertTrue(paywall)
    }

    func testRevokedEntitlementNeverGrants() async throws {
        let factory = StoreFactorySpy()
        factory.store.ownedProducts = [VerifiedEntitlement(productID: testProduct,
                                                           revokedAt: start)]
        let coordinator = enabledCoordinator(factory)
        try await coordinator.refreshEntitlements()
        let access = await coordinator.hasAccess(to: .chatHistory)
        XCTAssertFalse(access)
    }

    func testGateCheckRevalidatesAndDropsARevokedSubscription() async throws {
        let factory = StoreFactorySpy()
        factory.store.ownedProducts = [VerifiedEntitlement(productID: testProduct)]
        let coordinator = enabledCoordinator(factory)
        await coordinator.revalidate()
        var access = await coordinator.checkAccess(to: .chatHistory)
        XCTAssertTrue(access)
        factory.store.ownedProducts = [] // refunded/revoked at the store
        access = await coordinator.checkAccess(to: .chatHistory)
        XCTAssertFalse(access, "the gate must re-read the store, not trust the old snapshot")
        let nonPremium = await coordinator.checkAccess(to: .flashcards)
        XCTAssertTrue(nonPremium)
        XCTAssertEqual(factory.store.calls, ["currentEntitlements", "currentEntitlements",
                                             "currentEntitlements"],
                       "non-premium gates make no store call")
    }

    func testKillSwitchClearsCachedEntitlements() async throws {
        let factory = StoreFactorySpy()
        factory.store.ownedProducts = [VerifiedEntitlement(productID: testProduct)]
        let coordinator = enabledCoordinator(factory)
        try await coordinator.refreshEntitlements()
        await coordinator.apply(.killSwitch)
        let calls = factory.store.calls
        let free = await coordinator.checkAccess(to: .chatHistory)
        XCTAssertTrue(free, "killed billing is free")
        await coordinator.revalidate()
        XCTAssertEqual(factory.store.calls, calls, "no store calls after the kill switch")
    }

    func testUnapprovedProductIsRejectedWithoutStoreCall() async {
        let factory = StoreFactorySpy()
        let coordinator = BillingCoordinator(
            configuration: BillingConfiguration(isEnabled: true, productIDs: [testProduct]),
            makeStore: { factory.make() })
        do {
            _ = try await coordinator.purchase(productID: "test.unapproved")
            XCTFail("expected productUnavailable")
        } catch {
            XCTAssertEqual(error as? BillingError, .productUnavailable)
        }
        XCTAssertEqual(factory.made, 0)
        XCTAssertEqual(factory.store.calls, [])
    }

    func testEntitlementsOutsideApprovedProductsAreIgnored() {
        let policy = AccessPolicy(
            configuration: BillingConfiguration(isEnabled: true, productIDs: [testProduct]),
            premiumFeatures: [.chatHistory], entitlements: ["test.other"])
        XCTAssertFalse(policy.hasAccess(to: .chatHistory))
        XCTAssertTrue(policy.shouldPresentPaywall)
    }

    func testVerifiedEntitlementActivity() {
        XCTAssertTrue(VerifiedEntitlement(productID: "p").isActive(at: start))
        XCTAssertTrue(VerifiedEntitlement(productID: "p", expiresAt: start.addingTimeInterval(1))
            .isActive(at: start))
        XCTAssertFalse(VerifiedEntitlement(productID: "p", expiresAt: start).isActive(at: start))
        XCTAssertFalse(VerifiedEntitlement(productID: "p", revokedAt: start).isActive(at: start))
    }
}
