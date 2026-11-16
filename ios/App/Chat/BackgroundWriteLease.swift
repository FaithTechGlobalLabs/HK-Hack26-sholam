import UIKit

/// A short OS assertion while a stopped draft finishes its atomic local write.
/// No network continuation or automatic retry is performed in the background.
@MainActor
final class BackgroundWriteLease {
    private var identifier: UIBackgroundTaskIdentifier = .invalid
    init() {
        identifier = UIApplication.shared.beginBackgroundTask(withName: "KeepStoppedShalomDraft") { [weak self] in
            let owner = self
            Task { @MainActor in owner?.end() }
        }
    }
    func end() {
        guard identifier != .invalid else { return }
        let value = identifier
        identifier = .invalid
        UIApplication.shared.endBackgroundTask(value)
    }
}
