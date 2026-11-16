import Foundation
import ShalomCore
import StoreKit

/// Dormant StoreKit 2 adapter. Only `BillingCoordinator` may construct it, and
/// only when billing is active, which no current build is. Nothing here runs at
/// launch: no listener, transaction iteration or product request starts until
/// the coordinator calls in.
///
/// Rules: only `.verified` transactions count; unverified ones never grant and
/// are left unfinished; a verified transaction is finished after it is handled.
@available(iOS 17.0, *)
actor StoreKitStoreClient: StoreClient {
    private let productIDs: Set<String>
    private var updatesTask: Task<Void, Never>?

    init(productIDs: [String]) {
        self.productIDs = Set(productIDs)
    }

    deinit { updatesTask?.cancel() }

    func products(for ids: [String]) async throws -> [StoreProduct] {
        let allowed = ids.filter(productIDs.contains)
        guard !allowed.isEmpty else { return [] }
        return try await Product.products(for: allowed).map {
            StoreProduct(id: $0.id, displayName: $0.displayName,
                         displayPrice: $0.displayPrice, description: $0.description)
        }
    }

    func purchase(productID: String) async throws -> PurchaseOutcome {
        guard productIDs.contains(productID),
              let product = try await Product.products(for: [productID]).first else {
            throw BillingError.productUnavailable
        }
        let result = try await product.purchase()
        switch result {
        case .success(.verified(let transaction)):
            // Handled: the coordinator re-reads verified entitlements (with
            // their expiry) after this outcome. Then finish.
            let id = transaction.productID
            await transaction.finish()
            return productIDs.contains(id) && transaction.revocationDate == nil
                ? .purchased(productID: id) : .unverified
        case .success(.unverified):
            return .unverified
        case .pending:
            return .pending
        case .userCancelled:
            return .cancelled
        @unknown default:
            return .cancelled
        }
    }

    func restore() async throws -> Set<VerifiedEntitlement> {
        try await AppStore.sync()
        return await currentEntitlements()
    }

    /// Verified entitlements with their expiry, so the coordinator can stop
    /// granting the moment a subscription lapses without a new store read.
    func currentEntitlements() async -> Set<VerifiedEntitlement> {
        var owned = Set<VerifiedEntitlement>()
        let now = Date()
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  productIDs.contains(transaction.productID),
                  transaction.revocationDate == nil,
                  (transaction.expirationDate ?? .distantFuture) > now else { continue }
            owned.insert(VerifiedEntitlement(productID: transaction.productID,
                                             expiresAt: transaction.expirationDate,
                                             revokedAt: transaction.revocationDate))
        }
        return owned
    }

    func startListening(onUpdate: @escaping @Sendable (Set<VerifiedEntitlement>) async -> Void) async {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                if Task.isCancelled { return }
                guard case .verified(let transaction) = result else { continue }
                guard let self else { return }
                let owned = await self.currentEntitlements()
                await onUpdate(owned)
                await transaction.finish()
            }
        }
    }

    func stopListening() async {
        updatesTask?.cancel()
        updatesTask = nil
    }
}
