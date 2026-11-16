import Foundation
import Supabase

/// Native port of the web's `src/lib/auth/problems.ts`: Supabase Auth errors
/// become a short list of problems with calm, actionable copy. Never includes
/// the raw upstream message, tokens or URLs.
enum AuthProblem: Equatable, Sendable {
    case emailLimit
    case emailCooldown(seconds: Int?)
    case tooManyTries
    case invalidEmail
    case notAuthorized
    case codeInvalid
    case linkInvalid
    case linkOtherDevice
    case linkMissing
    case signupsClosed
    case network
    case unknown

    enum Stage { case send, verify, link }

    static func classify(_ error: any Error, stage: Stage) -> AuthProblem {
        if error is URLError { return .network }
        guard let auth = error as? AuthError else { return .unknown }
        let status: Int? = if case .api(_, _, _, let response) = auth { response.statusCode } else { nil }
        return classify(code: auth.errorCode.rawValue, status: status, message: auth.message, stage: stage)
    }

    /// Also used for `error_code` parameters on a Supabase redirect.
    static func classify(code: String?, status: Int?, message: String?, stage: Stage) -> AuthProblem {
        let code = code ?? ""
        let message = message ?? ""
        if message.range(of: "failed to fetch|network", options: [.regularExpression, .caseInsensitive]) != nil {
            return .network
        }
        switch code {
        case "over_email_send_rate_limit":
            if let match = message.range(of: #"after \d+ seconds?"#, options: [.regularExpression, .caseInsensitive]) {
                let digits = message[match].filter(\.isNumber)
                return .emailCooldown(seconds: Int(digits))
            }
            return .emailLimit
        case "over_request_rate_limit": return .tooManyTries
        case "email_address_invalid": return .invalidEmail
        case "email_address_not_authorized": return .notAuthorized
        case "signup_disabled", "otp_disabled": return .signupsClosed
        case "otp_expired": return stage == .verify ? .codeInvalid : .linkInvalid
        case "flow_state_not_found", "flow_state_expired", "bad_code_verifier": return .linkOtherDevice
        case "validation_failed":
            switch stage {
            case .send: return .invalidEmail
            case .verify: return .codeInvalid
            case .link: return .linkInvalid
            }
        default: break
        }
        if status == 429 { return stage == .send ? .emailLimit : .tooManyTries }
        if stage == .send,
           message.range(of: "invalid.*email|email.*invalid", options: [.regularExpression, .caseInsensitive]) != nil {
            return .invalidEmail
        }
        if stage != .send,
           message.range(of: "expired|invalid", options: [.regularExpression, .caseInsensitive]) != nil {
            return stage == .verify ? .codeInvalid : .linkInvalid
        }
        return .unknown
    }

    /// `codes` is true when the sign-in email carries a code (emailCode mode).
    /// Every case returns explicitly: the cooldown case has two statements, so
    /// this switch is a statement, not an implicit-return switch expression.
    func message(codes: Bool) -> String {
        switch self {
        case .emailLimit:
            return codes
                ? "We've sent as many sign-in emails as we can for now. If you already have a code from us, enter it. Otherwise try again in an hour."
                : "We've sent as many sign-in emails as we can for now. Use the link in an email we already sent, or try again in an hour."
        case .emailCooldown(let seconds):
            let wait = seconds.map { "\($0) seconds" } ?? "a minute"
            return codes
                ? "We just sent you an email. Use the code in it, or ask for another in \(wait)."
                : "We just sent you an email. Open its link on this device, or ask for another in \(wait)."
        case .tooManyTries: return "Too many tries. Wait a few minutes, then try again."
        case .invalidEmail: return "That doesn't look like an email address."
        case .notAuthorized: return "We can't send sign-in emails to this address yet. Shalom is still in testing."
        case .codeInvalid: return "That code didn't work. Check it against the latest email, or ask for a new one. Codes last an hour."
        case .linkInvalid:
            return codes
                ? "That sign-in link has expired or was already used. Enter the code from the same email, or ask for a new one."
                : "That sign-in link has expired or was already used. Ask for a new one here."
        case .linkOtherDevice:
            return codes
                ? "That link was opened on a different device or app from the one that asked for it. Enter the code from the email instead."
                : "That link was opened on a different device or app from the one that asked for it. Ask for a new link here, then open it on this device."
        case .linkMissing:
            return codes
                ? "That sign-in link is incomplete. Enter the code from the email, or ask for a new one."
                : "That sign-in link is incomplete. Ask for a new one here."
        case .signupsClosed: return "New accounts are closed right now."
        case .network: return "We couldn't reach the sign-in service. Check your connection and try again."
        case .unknown: return "Something went wrong. Try again."
        }
    }
}
