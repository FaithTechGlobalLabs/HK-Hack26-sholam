import Foundation
import ShalomCore

/// Mirrors `displayNameSchema` in `src/lib/account/types.ts`: drop control
/// characters, collapse whitespace, trim, then 1 to 40 characters. The web
/// counts JavaScript string length (UTF-16 units), so the limit does too.
enum DisplayNamePolicy {
    static let maxLength = 40

    static func normalize(_ raw: String) -> String? {
        DisplayName.normalized(raw)
    }
}

/// Email shape check before any request. The server remains the authority.
enum EmailPolicy {
    static func normalize(_ raw: String) -> String? {
        let email = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.count <= 254,
              email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil
        else { return nil }
        return email
    }

    /// Supabase `mailer_otp_length`, as on the web.
    static let codeLength = 8
    /// Supabase `smtp_max_frequency`, as on the web.
    static let resendGap: TimeInterval = 60

    static func normalizeCode(_ raw: String) -> String {
        String(raw.filter(\.isASCII).filter(\.isNumber).prefix(codeLength))
    }
}

/// The app's own Keychain service for native sign-in sessions. Cleanup and
/// the Supabase storage use exactly this service and nothing else.
enum AuthKeychainScope {
    static let service = "com.owenisas.shalom.auth"
}

/// Keychain items survive deleting the app; UserDefaults do not. On the first
/// launch of an installation (no marker yet) the previous installation's
/// sign-in session is removed before anything can restore it.
enum AuthInstallMarker {
    static let defaultsKey = "ShalomAuth.installMarker.v1"

    enum Outcome: Equatable {
        /// Marker already present: nothing removed, restoring is allowed.
        case existingInstall
        /// First launch: old sessions removed, marker written, restoring allowed.
        case cleanedFirstLaunch
        /// First launch but removal failed: do not restore this launch; the
        /// marker stays unset so the next launch tries again.
        case cleanupFailed
    }

    /// `removeStoredSessions` must delete only this app's auth service items
    /// and return true when none remain (including "nothing was there").
    static func prepare(defaults: UserDefaults, removeStoredSessions: () -> Bool) -> Outcome {
        guard !defaults.bool(forKey: defaultsKey) else { return .existingInstall }
        guard removeStoredSessions() else { return .cleanupFailed }
        defaults.set(true, forKey: defaultsKey)
        return .cleanedFirstLaunch
    }
}

extension AuthInstallMarker.Outcome {
    var mayRestoreSession: Bool { self != .cleanupFailed }
}

/// A Keychain session restored at launch (`.initialSession`) is only shown as
/// signed in while its access token is still valid; an expired one waits for
/// a successful refresh first.
enum SessionRestorePolicy {
    /// Treat a token this close to expiry as already expired.
    static let leeway: TimeInterval = 30

    static func isUsable(expiresAt: TimeInterval, now: Date = Date()) -> Bool {
        Date(timeIntervalSince1970: expiresAt) > now.addingTimeInterval(leeway)
    }
}

/// Only `shalom://auth/callback` (any case of scheme/host, exact path, no
/// credentials or port) is accepted as a sign-in callback.
enum AuthCallbackValidator {
    static func isValid(_ url: URL, expected: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let want = URLComponents(url: expected, resolvingAgainstBaseURL: false)
        else { return false }
        return components.scheme?.lowercased() == want.scheme?.lowercased()
            && components.host?.lowercased() == want.host?.lowercased()
            && components.path == want.path
            && components.user == nil && components.password == nil && components.port == nil
    }

    /// Supabase redirect errors arrive as query or fragment parameters.
    static func redirectError(in url: URL) -> (code: String?, description: String?)? {
        var items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let fragment = url.fragment, let parsed = URLComponents(string: "?" + fragment)?.queryItems {
            items += parsed
        }
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard value("error") != nil || value("error_code") != nil else { return nil }
        return (value("error_code"), value("error_description"))
    }

    static func hasCredentialParameters(_ url: URL) -> Bool {
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let fragment = url.fragment.flatMap { URLComponents(string: "?" + $0)?.queryItems } ?? []
        let names = Set((query + fragment).map(\.name))
        guard !names.contains("access_token"), !names.contains("refresh_token") else { return false }
        let codes = query.filter { $0.name == "code" }
        guard codes.count == 1, let code = codes.first?.value else { return false }
        return !code.isEmpty && code.utf8.count <= 2_048
    }
}
