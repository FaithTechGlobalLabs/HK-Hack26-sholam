import Foundation
import ShalomCore

/// Second, source-level gate. Even a build whose Info.plist says billing is on
/// stays free until this is changed in a reviewed release with approved
/// products, App Store Connect setup and paywall review.
enum BillingActivation {
    static let approved = false
}

enum BillingEnvironment {
    /// The bundle configuration as the core billing type. Off unless the build
    /// flag, the source activation gate and a non-empty product list all agree.
    static func configuration(from native: NativeConfiguration) -> BillingConfiguration {
        guard BillingActivation.approved, native.billingEnabled else { return .disabled }
        return BillingConfiguration(isEnabled: true, productIDs: native.productIDs)
    }

    static func accessPolicy(for native: NativeConfiguration) -> AccessPolicy {
        AccessPolicy(configuration: configuration(from: native))
    }

    /// The StoreKit adapter is built lazily by the coordinator and only when
    /// billing is active, which it is not in this build. If a future build
    /// owns a coordinator, call `revalidate()` at launch and on every return
    /// to `.active`, and gate premium features with `checkAccess(to:)`; both
    /// are no-ops with zero store construction while billing is off.
    static func makeCoordinator(for native: NativeConfiguration) -> BillingCoordinator {
        let configuration = configuration(from: native)
        let productIDs = configuration.productIDs
        return BillingCoordinator(configuration: configuration, makeStore: {
            StoreKitStoreClient(productIDs: productIDs)
        })
    }
}
