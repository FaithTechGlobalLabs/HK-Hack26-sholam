import Foundation

/// The only path from the app to a store client. When billing is inactive
/// (off, missing products or killed by the server) every entry point throws
/// `BillingError.billingDisabled` (or, for `revalidate`/`checkAccess`, returns
/// free access) before the store factory is ever called, so no StoreKit
/// adapter, task, listener or transaction iteration exists.
///
/// Entitlements are kept with their expiration and revocation dates and are
/// evaluated against the clock at every check; `checkAccess(to:)` re-reads
/// the store before answering and `revalidate()` is the launch/resume hook.
public actor BillingCoordinator {
    private let buildConfiguration: BillingConfiguration
    private let premiumFeatures: Set<BillingFeature>
    private let makeStore: @Sendable () -> any StoreClient
    private let now: @Sendable () -> Date
    private var serverSignal: ServerBillingSignal = .noChange
    private var store: (any StoreClient)?
    private var isListening = false
    /// Last verified store snapshot. Never read without the clock filter.
    private var snapshot: Set<VerifiedEntitlement> = []
    /// Orders store reads so an older read finishing late cannot overwrite a
    /// newer one (e.g. a refresh racing a transaction update).
    private var readsIssued = 0
    private var lastAppliedRead = 0

    public init(configuration: BillingConfiguration,
                premiumFeatures: Set<BillingFeature> = [],
                makeStore: @escaping @Sendable () -> any StoreClient,
                now: @escaping @Sendable () -> Date = { Date() }) {
        self.buildConfiguration = configuration
        self.premiumFeatures = premiumFeatures
        self.makeStore = makeStore
        self.now = now
    }

    /// The configuration in force after any server signal.
    public var effectiveConfiguration: BillingConfiguration {
        buildConfiguration.applying(serverSignal)
    }

    /// Policy as of this moment: expired or revoked entitlements do not count.
    public var policy: AccessPolicy {
        let moment = now()
        let active = Set(snapshot.filter { $0.isActive(at: moment) }.map(\.productID))
        return AccessPolicy(configuration: buildConfiguration, serverSignal: serverSignal,
                            premiumFeatures: premiumFeatures, entitlements: active)
    }

    /// Cached answer, still clock-checked. Prefer `checkAccess(to:)` at a gate.
    public func hasAccess(to feature: BillingFeature) -> Bool { policy.hasAccess(to: feature) }
    public var shouldPresentPaywall: Bool { policy.shouldPresentPaywall }

    /// Gate check for a feature. Free (and zero store calls) whenever billing
    /// is inactive or the feature is not premium; otherwise re-reads verified
    /// entitlements from the store first.
    public func checkAccess(to feature: BillingFeature) async -> Bool {
        guard effectiveConfiguration.isActive, premiumFeatures.contains(feature),
              let active = try? activeStore() else {
            return policy.hasAccess(to: feature)
        }
        await readEntitlements(from: active.0)
        return policy.hasAccess(to: feature)
    }

    /// Launch/resume hook. Does nothing (no store construction) when inactive.
    public func revalidate() async {
        guard effectiveConfiguration.isActive, let active = try? activeStore() else { return }
        await readEntitlements(from: active.0)
    }

    /// Server signals can only disable. Once killed, a later `.noChange` does
    /// not re-enable billing for this coordinator's lifetime.
    public func apply(_ signal: ServerBillingSignal) async {
        guard signal == .killSwitch, serverSignal != .killSwitch else { return }
        serverSignal = .killSwitch
        snapshot = []
        if isListening, let store {
            isListening = false
            await store.stopListening()
        }
    }

    public func loadProducts() async throws -> [StoreProduct] {
        let (store, configuration) = try activeStore()
        let products = try await store.products(for: configuration.productIDs)
        return products.filter { configuration.productIDs.contains($0.id) }
    }

    public func purchase(productID: String) async throws -> PurchaseOutcome {
        let (store, configuration) = try activeStore(requiring: productID)
        let outcome = try await store.purchase(productID: productID)
        // Only a verified purchase (adapter contract) of an approved product
        // triggers a re-read; access then comes from the store's verified
        // entitlements and their dates, never from the outcome alone.
        if case .purchased(let id) = outcome, configuration.productIDs.contains(id),
           effectiveConfiguration.isActive {
            await readEntitlements(from: store)
        }
        return outcome
    }

    public func restore() async throws {
        let (store, _) = try activeStore()
        let ticket = nextReadTicket()
        let restored = try await store.restore()
        record(restored, ticket: ticket)
    }

    /// Re-reads verified entitlements (the "receipt" entry point).
    public func refreshEntitlements() async throws {
        let (store, _) = try activeStore()
        await readEntitlements(from: store)
    }

    public func startListening() async throws {
        let (store, _) = try activeStore()
        guard !isListening else { return }
        isListening = true
        await store.startListening { [weak self] updated in
            await self?.receive(updated)
        }
        // A kill switch or stopListening may have run while the store was
        // starting, possibly before its listener existed. Stop it now.
        if !isListening || !effectiveConfiguration.isActive {
            isListening = false
            await store.stopListening()
        }
    }

    public func stopListening() async {
        guard isListening, let store else { return }
        isListening = false
        await store.stopListening()
    }

    private func receive(_ updated: Set<VerifiedEntitlement>) {
        record(updated, ticket: nextReadTicket())
    }

    private func readEntitlements(from store: any StoreClient) async {
        let ticket = nextReadTicket()
        let current = await store.currentEntitlements()
        record(current, ticket: ticket)
    }

    private func nextReadTicket() -> Int {
        readsIssued += 1
        return readsIssued
    }

    private func record(_ entitlements: Set<VerifiedEntitlement>, ticket: Int) {
        guard effectiveConfiguration.isActive, ticket > lastAppliedRead else { return }
        lastAppliedRead = ticket
        snapshot = entitlements
    }

    private func activeStore(requiring productID: String? = nil) throws
        -> (any StoreClient, BillingConfiguration) {
        let configuration = effectiveConfiguration
        guard configuration.isActive else { throw BillingError.billingDisabled }
        if let productID, !configuration.productIDs.contains(productID) {
            throw BillingError.productUnavailable
        }
        if let store { return (store, configuration) }
        let created = makeStore()
        store = created
        return (created, configuration)
    }
}
