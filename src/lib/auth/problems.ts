import { SIGN_IN_EMAIL_HAS_CODE } from "./email";

/**
 * Turns Supabase Auth errors into a short list of problems the sign-in
 * screens explain in plain words. Error codes come from
 * @supabase/auth-js (`ErrorCode`); the messages are ours.
 */

export const AUTH_PROBLEMS = [
  "email_limit",
  "email_cooldown",
  "too_many_tries",
  "invalid_email",
  "not_authorized",
  "code_invalid",
  "link_invalid",
  "link_other_browser",
  "link_missing",
  "signups_closed",
  "network",
  "unknown",
] as const;

export type AuthProblem = (typeof AUTH_PROBLEMS)[number];

export interface ClassifiedProblem {
  problem: AuthProblem;
  /** Seconds until another email may be requested (email_cooldown only). */
  seconds?: number;
}

/** The fields we read from an AuthError (or a Supabase redirect's params). */
export interface AuthErrorLike {
  code?: string | null;
  status?: number | null;
  message?: string | null;
  name?: string | null;
}

/** Where the error happened: asking for an email, typing the code, or opening the link. */
export type AuthStage = "send" | "verify" | "link";

export function classifyAuthError(
  error: AuthErrorLike | null | undefined,
  stage: AuthStage,
): ClassifiedProblem {
  if (!error) return { problem: "unknown" };
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (
    error.name === "AuthRetryableFetchError" ||
    (error.status === 0 && !code) ||
    /failed to fetch|network/i.test(message)
  )
    return { problem: "network" };

  switch (code) {
    case "over_email_send_rate_limit": {
      // Two limits share this code: the per-address gap between emails
      // ("you can only request this after 42 seconds") and the project's
      // hourly cap on emails ("email rate limit exceeded").
      const wait = /after (\d+) seconds?/i.exec(message);
      if (wait) return { problem: "email_cooldown", seconds: Number(wait[1]) };
      return { problem: "email_limit" };
    }
    case "over_request_rate_limit":
      return { problem: "too_many_tries" };
    case "email_address_invalid":
      return { problem: "invalid_email" };
    case "email_address_not_authorized":
      return { problem: "not_authorized" };
    case "signup_disabled":
    case "otp_disabled":
      return { problem: "signups_closed" };
    case "otp_expired":
      return { problem: stage === "verify" ? "code_invalid" : "link_invalid" };
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
      return { problem: "link_other_browser" };
    case "validation_failed":
      if (stage === "send") return { problem: "invalid_email" };
      return { problem: stage === "verify" ? "code_invalid" : "link_invalid" };
  }

  if (error.status === 429)
    return { problem: stage === "send" ? "email_limit" : "too_many_tries" };
  if (/invalid.*email|email.*invalid/i.test(message) && stage === "send")
    return { problem: "invalid_email" };
  if (/expired|invalid/i.test(message) && stage !== "send")
    return { problem: stage === "verify" ? "code_invalid" : "link_invalid" };
  return { problem: "unknown" };
}

export function isAuthProblem(value: unknown): value is AuthProblem {
  return (
    typeof value === "string" &&
    (AUTH_PROBLEMS as readonly string[]).includes(value)
  );
}

/**
 * What the person reads. Short, calm, and says what to do next. With
 * `codes` off (the email has only a link, see email.ts) nothing mentions a
 * code.
 */
export function problemMessage(
  { problem, seconds }: ClassifiedProblem,
  codes: boolean = SIGN_IN_EMAIL_HAS_CODE,
): string {
  const wait = seconds ? `${seconds} seconds` : "a minute";
  switch (problem) {
    case "email_limit":
      return codes
        ? "We've sent as many sign-in emails as we can for now. If you already have a code from us, enter it. Otherwise try again in an hour."
        : "We've sent as many sign-in emails as we can for now. Use the link in an email we already sent, or try again in an hour.";
    case "email_cooldown":
      return codes
        ? `We just sent you an email. Use the code in it, or ask for another in ${wait}.`
        : `We just sent you an email. Open its link, or ask for another in ${wait}.`;
    case "too_many_tries":
      return "Too many tries. Wait a few minutes, then try again.";
    case "invalid_email":
      return "That doesn't look like an email address.";
    case "not_authorized":
      return "We can't send sign-in emails to this address yet. Shalom is still in testing.";
    case "code_invalid":
      return "That code didn't work. Check it against the latest email, or ask for a new one. Codes last an hour.";
    case "link_invalid":
      return codes
        ? "That sign-in link has expired or was already used. Enter the code from the same email, or ask for a new one."
        : "That sign-in link has expired or was already used. Ask for a new one here.";
    case "link_other_browser":
      return codes
        ? "That link was opened in a different browser from the one that asked for it. Enter the code from the email instead."
        : "That link was opened in a different browser from the one that asked for it. Open it in the same browser, or ask for a new link here.";
    case "link_missing":
      return codes
        ? "That sign-in link is incomplete. Enter the code from the email, or ask for a new one."
        : "That sign-in link is incomplete. Ask for a new one here.";
    case "signups_closed":
      return "New accounts are closed right now.";
    case "network":
      return "We couldn't reach the sign-in service. Check your connection and try again.";
    case "unknown":
      return "Something went wrong. Try again.";
  }
}
