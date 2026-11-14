import { describe, expect, it } from "vitest";
import { parseSignInLink } from "@/lib/auth/link";
import {
  canResend,
  initialLoginState,
  loginReducer,
  normalizeCode,
  RESEND_GAP_MS,
} from "@/lib/auth/login-state";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  classifyAuthError,
  isAuthProblem,
  problemMessage,
} from "@/lib/auth/problems";

describe("safeNextPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeNextPath("/c/123?x=1#end")).toBe("/c/123?x=1#end");
    expect(safeNextPath("/flashcards")).toBe("/flashcards");
  });

  it.each([
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/ok\nLocation: x",
    "",
    undefined,
    42,
  ])("rejects %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });

  it("never sends a finished sign-in back into the sign-in flow", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath("/auth/confirm?token_hash=abc")).toBe("/");
  });
});

describe("classifyAuthError", () => {
  it("tells the hourly email cap from the per-address cooldown", () => {
    expect(
      classifyAuthError(
        {
          code: "over_email_send_rate_limit",
          status: 429,
          message: "email rate limit exceeded",
        },
        "send",
      ),
    ).toEqual({ problem: "email_limit" });
    expect(
      classifyAuthError(
        {
          code: "over_email_send_rate_limit",
          status: 429,
          message:
            "For security purposes, you can only request this after 42 seconds.",
        },
        "send",
      ),
    ).toEqual({ problem: "email_cooldown", seconds: 42 });
  });

  it("maps an expired token to the right step", () => {
    const error = {
      code: "otp_expired",
      status: 403,
      message: "Token has expired or is invalid",
    };
    expect(classifyAuthError(error, "verify").problem).toBe("code_invalid");
    expect(classifyAuthError(error, "link").problem).toBe("link_invalid");
  });

  it("explains the built-in mailer's team-only rule", () => {
    expect(
      classifyAuthError({ code: "email_address_not_authorized" }, "send")
        .problem,
    ).toBe("not_authorized");
  });

  it("recognises a PKCE link opened in another browser", () => {
    expect(
      classifyAuthError({ code: "flow_state_not_found" }, "link").problem,
    ).toBe("link_other_browser");
  });

  it("reads Supabase's redirect error parameters", () => {
    expect(
      classifyAuthError(
        {
          code: "access_denied",
          message: "Email link is invalid or has expired",
        },
        "link",
      ).problem,
    ).toBe("link_invalid");
  });

  it("treats fetch failures as network problems", () => {
    expect(
      classifyAuthError(
        {
          name: "AuthRetryableFetchError",
          status: 0,
          message: "Failed to fetch",
        },
        "send",
      ).problem,
    ).toBe("network");
  });

  it("has a message for every problem, and only known problems pass the guard", () => {
    expect(problemMessage({ problem: "email_cooldown", seconds: 9 })).toMatch(
      "9 seconds",
    );
    expect(isAuthProblem("link_invalid")).toBe(true);
    expect(isAuthProblem("<script>")).toBe(false);
  });
});

describe("login form states", () => {
  const at = 1_000_000;

  it("moves to the code step once the email is sent", () => {
    let state = initialLoginState();
    state = loginReducer(state, { type: "send" });
    expect(state.busy).toBe(true);
    state = loginReducer(state, { type: "sent", email: "a@b.co", at });
    expect(state).toMatchObject({
      step: "code",
      email: "a@b.co",
      busy: false,
      sent: true,
      resendAfter: at + RESEND_GAP_MS,
    });
    expect(canResend(state, at + 1000)).toBe(false);
    expect(canResend(state, at + RESEND_GAP_MS)).toBe(true);
  });

  it("stays on the email step when the hourly email cap is hit", () => {
    const state = loginReducer(initialLoginState(), {
      type: "send_failed",
      email: "a@b.co",
      problem: { problem: "email_limit" },
      at,
    });
    expect(state.step).toBe("email");
    expect(state.problem?.problem).toBe("email_limit");
  });

  it("goes to the code step on a cooldown (an email just went out)", () => {
    const state = loginReducer(initialLoginState(), {
      type: "send_failed",
      email: "a@b.co",
      problem: { problem: "email_cooldown", seconds: 30 },
      at,
    });
    expect(state.step).toBe("code");
    expect(state.resendAfter).toBe(at + 30_000);
  });

  it("lets someone with a code skip sending another email", () => {
    const state = loginReducer(
      initialLoginState({ problem: { problem: "link_invalid" } }),
      { type: "have_code", email: "a@b.co" },
    );
    expect(state).toMatchObject({ step: "code", problem: null, sent: false });
  });

  it("keeps the code step on a wrong code, then asks new accounts for a name", () => {
    let state = loginReducer(initialLoginState(), {
      type: "sent",
      email: "a@b.co",
      at,
    });
    state = loginReducer(state, { type: "verify" });
    state = loginReducer(state, {
      type: "verify_failed",
      problem: { problem: "code_invalid" },
    });
    expect(state.step).toBe("code");
    expect(state.problem?.problem).toBe("code_invalid");
    state = loginReducer(state, { type: "verify" });
    expect(state.problem).toBeNull();
    expect(
      loginReducer(state, { type: "verified", needsName: true }).step,
    ).toBe("name");
    expect(
      loginReducer(state, { type: "verified", needsName: false }).step,
    ).toBe("done");
  });

  it("can start at the name step (after a link sign-in)", () => {
    let state = initialLoginState({ step: "name" });
    state = loginReducer(state, { type: "save_name" });
    state = loginReducer(state, { type: "name_saved" });
    expect(state.step).toBe("done");
  });

  it("goes back to the email step to change address", () => {
    const sent = loginReducer(initialLoginState(), {
      type: "sent",
      email: "a@b.co",
      at,
    });
    expect(loginReducer(sent, { type: "change_email" })).toMatchObject({
      step: "email",
      sent: false,
    });
  });

  it("accepts pasted codes with spaces or dashes", () => {
    expect(normalizeCode(" 1234 5678 ")).toBe("12345678");
    expect(normalizeCode("1234-5678")).toBe("12345678");
  });
});

describe("parseSignInLink", () => {
  it("reads the emailed link", () => {
    expect(
      parseSignInLink({
        token_hash: "pkce_0123abcdef",
        type: "email",
        next: "/c/1",
      }),
    ).toEqual({ tokenHash: "pkce_0123abcdef", type: "email", next: "/c/1" });
  });

  it("defaults the type and cleans next", () => {
    expect(
      parseSignInLink({ token_hash: "0123456789", next: "//evil.example" }),
    ).toEqual({ tokenHash: "0123456789", type: "email", next: "/" });
  });

  it("refuses missing or odd tokens and types", () => {
    expect(parseSignInLink({})).toBeNull();
    expect(parseSignInLink({ token_hash: "short" })).toBeNull();
    expect(parseSignInLink({ token_hash: "abc def ghij" })).toBeNull();
    expect(
      parseSignInLink({ token_hash: "0123456789", type: "recovery" }),
    ).toBeNull();
  });
});
