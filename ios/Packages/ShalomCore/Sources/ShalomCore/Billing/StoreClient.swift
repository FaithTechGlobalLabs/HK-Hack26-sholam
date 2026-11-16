import Foundation

/// A product as the paywall would display it. Prices come from the store at
/// runtime; nothing here invents a price, trial or product ID.
public struct StoreProduct: Equatable, Identifiable, Sendable {
    public let id: String
    public let displayName: String
    public let displayPrice: String
    public let description: String

    public init(id: String, displayName: String, displayPrice: String, description: String = "") {
        self.id = id; self.displayName = displayName
        self.displayPrice = displayPrice; self.description = description
    }
}

/// One verified store entitlement with the dates that end it. Access is
/// evaluated against these dates at the moment of each check, so a cached
/// snapshot can never keep an expired or revoked subscription unlocked.
public struct VerifiedEntitlement: Hashable, Sendable {
    public let productID: String
    /// nil for non-expiring products.
    public let expiresAt: Date?
    /// Set when the store reports a refund or revocation.
    public let revokedAt: Date?

    public init(productID: String, expiresAt: Date? = nil, revokedAt: Date? = nil) {
        self.productID = productID
        self.expiresAt = expiresAt
        self.revokedAt = revokedAt
    }

    /// Active only when not revoked and not yet expired at `now`.
    public func isActive(at now: Date) -> Bool {
        guard revokedAt == nil else { return false }
        guard let expiresAt else { return true }
        return expiresAt > now
    }
}

public enum PurchaseOutcome: Equatable, Sendable {
    /// A verified transaction for this product was handled and finished.
    /// Grants nothing by itself: the coordinator re-reads verified
    /// entitlements (with their expiry) from the store afterwards.
    case purchased(productID: String)
    /// Awaiting approval (Ask to Buy, SCA). Grants nothing yet.
    case pending
    case cancelled
    /// The store returned a transaction that failed verification. Grants nothing.
    case unverified
}

/// Injected store boundary. The app's StoreKit 2 adapter implements it; tests
/// use a spy. Implementations must report only verified entitlements, with
/// their expiration and revocation dates.
public protocol StoreClient: Sendable {
    func products(for ids: [String]) async throws -> [StoreProduct]
    func purchase(productID: String) async throws -> PurchaseOutcome
    /// Syncs with the store and returns verified entitlements.
    func restore() async throws -> Set<VerifiedEntitlement>
    /// Verified entitlements currently owned (local, no network sync).
    func currentEntitlements() async -> Set<VerifiedEntitlement>
    /// Starts observing transaction updates. `onUpdate` receives the verified
    /// entitlements after each handled update.
    func startListening(onUpdate: @escaping @Sendable (Set<VerifiedEntitlement>) async -> Void) async
    func stopListening() async
}
