import Foundation

/// Decides access to features. While billing is inactive every feature is
/// granted by policy and the paywall is never presented.
public struct AccessPolicy: Equatable, Sendable {
    public let configuration: BillingConfiguration
    /// Features that would need an entitlement once billing is approved.
    /// Empty today; an enabled build with no premium features still grants all.
    public let premiumFeatures: Set<BillingFeature>
    /// Verified, unexpired, unrevoked product IDs reported by the store client.
    public let entitlements: Set<String>

    public init(configuration: BillingConfiguration,
                serverSignal: ServerBillingSignal = .noChange,
                premiumFeatures: Set<BillingFeature> = [],
                entitlements: Set<String> = []) {
        let effective = configuration.applying(serverSignal)
        self.configuration = effective
        self.premiumFeatures = premiumFeatures
        // Only entitlements for this build's approved products count.
        self.entitlements = entitlements.intersection(effective.productIDs)
    }

    /// Billing is off, unconfigured or killed: everything is free.
    public static let free = AccessPolicy(configuration: .disabled)

    public var isFreeMode: Bool { !configuration.isActive }

    public func hasAccess(to feature: BillingFeature) -> Bool {
        guard configuration.isActive else { return true }
        guard premiumFeatures.contains(feature) else { return true }
        return !entitlements.isEmpty
    }

    /// True only for an active build with a premium feature the person lacks.
    public var shouldPresentPaywall: Bool {
        guard configuration.isActive, !premiumFeatures.isEmpty else { return false }
        return entitlements.isEmpty
    }
}
