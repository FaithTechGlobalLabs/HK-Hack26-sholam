import Foundation

/// Public application configuration only. Provider keys, database credentials
/// and privileged Supabase credentials must never be part of this target.
struct NativeConfiguration: Sendable {
    enum SignInMode: String, Sendable { case disabled, emailCode, magicLink }

    let apiBaseURL: URL
    let supabaseURL: URL?
    let supabasePublishableKey: String?
    let signInMode: SignInMode
    let authCallbackURL: URL
    let billingEnabled: Bool
    let productIDs: [String]

    var environmentID: String { apiBaseURL.absoluteString }
    var canSignIn: Bool {
        signInMode != .disabled && supabaseURL != nil && supabasePublishableKey != nil
    }

    static func load(bundle: Bundle = .main) -> Self {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing")
            || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return Self(
                apiBaseURL: URL(string: "https://ui-tests.invalid")!,
                supabaseURL: nil, supabasePublishableKey: nil, signInMode: .disabled,
                authCallbackURL: URL(string: "shalom://auth/callback")!,
                billingEnabled: false, productIDs: []
            )
        }
        #endif
        func value(_ key: String) -> String? {
            guard let string = bundle.object(forInfoDictionaryKey: key) as? String else { return nil }
            let result = string.trimmingCharacters(in: .whitespacesAndNewlines)
            return result.isEmpty || result.contains("$(") ? nil : result
        }
        // Release transport is HTTPS only; local HTTP is opt-in in DEBUG.
        let production = URL(string: "https://sholam.vercel.app")!
        let configured = value("ShalomAPIBaseURL").flatMap(URL.init(string:))
        let apiURL: URL
        if let configured, configured.scheme == "https", configured.host != nil,
           configured.user == nil, configured.password == nil {
            apiURL = configured
        } else {
            #if DEBUG
            if let configured, configured.scheme == "http",
               ["localhost", "127.0.0.1", "::1"].contains(configured.host ?? "") {
                apiURL = configured
            } else { apiURL = production }
            #else
            apiURL = production
            #endif
        }
        let authURL = value("ShalomSupabaseURL").flatMap(URL.init(string:))
        let safeAuthURL = authURL?.scheme == "https" && authURL?.host != nil ? authURL : nil
        return Self(
            apiBaseURL: apiURL,
            supabaseURL: safeAuthURL,
            supabasePublishableKey: value("ShalomSupabasePublishableKey"),
            signInMode: SignInMode(rawValue: value("ShalomNativeSignInMode") ?? "disabled") ?? .disabled,
            authCallbackURL: URL(string: "shalom://auth/callback")!,
            // Missing/invalid settings leave billing off. The shipped xcconfig
            // has NO in every build and no products. No remote flag can enable it.
            billingEnabled: (bundle.object(forInfoDictionaryKey: "ShalomBillingEnabled") as? Bool) == true,
            productIDs: (value("ShalomProductIDs") ?? "")
                .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        )
    }
}
