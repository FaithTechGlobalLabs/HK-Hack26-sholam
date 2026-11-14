import type { ClassifiedProblem } from "./problems";

/**
 * The sign-in form as a small state machine, kept apart from React so the
 * steps and messages can be unit-tested. One flow serves sign-in and
 * sign-up: email → code (or the link in the same email) → a name for new
 * accounts → done.
 */

export type LoginStep = "email" | "code" | "name" | "done";

export interface LoginState {
  step: LoginStep;
  email: string;
  busy: boolean;
  problem: ClassifiedProblem | null;
  /** True once an email went out in this visit (shows "code sent"). */
  sent: boolean;
  /** Epoch ms before which "Send a new code" stays disabled. */
  resendAfter: number;
}

export type LoginAction =
  | { type: "send" }
  | { type: "sent"; email: string; at: number }
  | {
      type: "send_failed";
      email: string;
      problem: ClassifiedProblem;
      at: number;
    }
  | { type: "have_code"; email: string }
  | { type: "verify" }
  | { type: "verified"; needsName: boolean }
  | { type: "verify_failed"; problem: ClassifiedProblem }
  | { type: "change_email" }
  | { type: "save_name" }
  | { type: "name_saved" }
  | { type: "name_failed"; problem: ClassifiedProblem }
  | { type: "dismiss" };

/** Supabase waits this long between emails to one address (`smtp_max_frequency`). */
export const RESEND_GAP_MS = 60_000;

/** Digits in the emailed code (Supabase `mailer_otp_length`). */
export const CODE_LENGTH = 8;

export function initialLoginState(
  init: { step?: LoginStep; problem?: ClassifiedProblem | null } = {},
): LoginState {
  return {
    step: init.step ?? "email",
    email: "",
    busy: false,
    problem: init.problem ?? null,
    sent: false,
    resendAfter: 0,
  };
}

export function loginReducer(
  state: LoginState,
  action: LoginAction,
): LoginState {
  switch (action.type) {
    case "send":
    case "verify":
    case "save_name":
      return { ...state, busy: true, problem: null };
    case "sent":
      return {
        ...state,
        step: "code",
        email: action.email,
        busy: false,
        problem: null,
        sent: true,
        resendAfter: action.at + RESEND_GAP_MS,
      };
    case "send_failed": {
      const { problem } = action;
      // A cooldown means an email went out moments ago, so its code works:
      // go to the code step and say when another can be sent.
      if (problem.problem === "email_cooldown") {
        return {
          ...state,
          step: "code",
          email: action.email,
          busy: false,
          problem,
          resendAfter: action.at + (problem.seconds ?? 60) * 1000,
        };
      }
      return { ...state, email: action.email, busy: false, problem };
    }
    case "have_code":
      return {
        ...state,
        step: "code",
        email: action.email,
        busy: false,
        problem: null,
      };
    case "verified":
      return {
        ...state,
        step: action.needsName ? "name" : "done",
        busy: false,
        problem: null,
      };
    case "verify_failed":
    case "name_failed":
      return { ...state, busy: false, problem: action.problem };
    case "change_email":
      return {
        ...state,
        step: "email",
        busy: false,
        problem: null,
        sent: false,
      };
    case "name_saved":
      return { ...state, step: "done", busy: false, problem: null };
    case "dismiss":
      return { ...state, problem: null };
  }
}

/** Keeps digits only, so pasted "1234 5678" or "1234-5678" still works. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

export function canResend(state: LoginState, now: number): boolean {
  return !state.busy && now >= state.resendAfter;
}
