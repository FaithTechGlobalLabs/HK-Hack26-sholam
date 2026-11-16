import Foundation

// Billing is prepared but OFF. Every feature is free, no paywall is shown and
// no store traffic happens unless a build is explicitly configured on AND has
// approved product IDs. A server signal may only turn billing off.

/// What the build says about billing. Comes from the app's bundled public
/// configuration only; nothing fetched at runtime can construct an enabled value
/// for a build that shipped with billing off.
public struct BillingConfiguration: Equatable, Sendable {
    public let isEnabled: Bool
    /// App Store product IDs approved for sale. Empty in the current build.
    public let productIDs: [String]

    public init(isEnabled: Bool, productIDs: [String]) {
        self.isEnabled = isEnabled
        var seen = Set<String>()
        self.productIDs = productIDs
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    /// Billing off, no products. Also what a missing configuration means.
    public static let disabled = BillingConfiguration(isEnabled: false, productIDs: [])

    /// Billing only acts when the build enables it and lists at least one product.
    public var isActive: Bool { isEnabled && !productIDs.isEmpty }

    /// Applies a server signal. The result is never more enabled than `self`.
    public func applying(_ signal: ServerBillingSignal) -> BillingConfiguration {
        switch signal {
        case .noChange: self
        case .killSwitch: .disabled
        }
    }
}

/// A remote instruction about billing. Deliberately has no "enable" case:
/// the server can switch billing off for a build, never on.
public enum ServerBillingSignal: String, Codable, Equatable, Sendable {
    case noChange
    case killSwitch
}

/// Features the access policy can reason about. All are free today.
public enum BillingFeature: String, CaseIterable, Codable, Sendable {
    case guidedChat
    case flashcards
    case chatHistory
    case flashcardCreation
}

public enum BillingError: Error, Equatable, Sendable, LocalizedError {
    /// Billing is off for this build (or switched off by the server).
    case billingDisabled
    /// The product is not one of this build's approved product IDs.
    case productUnavailable
    /// The App Store returned a transaction that failed verification.
    case unverifiedTransaction

    public var errorDescription: String? {
        switch self {
        case .billingDisabled: "Purchases are turned off. Every feature is free."
        case .productUnavailable: "That item isn't available."
        case .unverifiedTransaction: "The App Store couldn't verify that purchase, so nothing was unlocked."
        }
    }
}
