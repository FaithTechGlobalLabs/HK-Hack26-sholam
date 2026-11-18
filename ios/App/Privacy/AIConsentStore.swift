import CryptoKit
import Foundation
import Observation
import ShalomCore

@MainActor @Observable
final class AIConsentStore {
    static let disclosureVersion = 1
    private(set) var isAllowed = false
    @ObservationIgnored private let defaults: UserDefaults?
    @ObservationIgnored private var scope: ChatCacheScope
    @ObservationIgnored private var memoryGrants = Set<String>()

    init(scope: ChatCacheScope, defaults: UserDefaults? = .standard) {
        self.scope = scope
        self.defaults = defaults
        reload()
    }

    private var key: String {
        let value = scope.environment + "\n" + (scope.userID.map { "account:\($0)" } ?? "guest")
        let hash = SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
        return "Shalom.ai-sharing." + hash
    }

    private var grantValue: String { "disclosure-\(Self.disclosureVersion)" }

    func grant() {
        if let defaults {
            defaults.set(grantValue, forKey: key)
        } else {
            memoryGrants.insert(key + grantValue)
        }
        reload()
    }

    func revoke() {
        defaults?.removeObject(forKey: key)
        memoryGrants.remove(key + grantValue)
        isAllowed = false
    }

    func changeScope(_ value: ChatCacheScope) {
        scope = value
        reload()
    }

    func reload() {
        isAllowed = scope.isValidForConsent && (defaults.map { $0.string(forKey: key) == grantValue }
            ?? memoryGrants.contains(key + grantValue))
    }
}

private extension ChatCacheScope {
    var isValidForConsent: Bool {
        !environment.isEmpty && environment.utf8.count <= 512
            && (userID.map { !$0.isEmpty && $0.utf8.count <= 128 } ?? true)
    }
}
