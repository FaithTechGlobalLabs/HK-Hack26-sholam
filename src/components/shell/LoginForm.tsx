"use client";

import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";
import { authStyles as s } from "@/components/auth/AuthFrame";
import { DISPLAY_NAME_MAX } from "@/lib/account/types";
import { refreshAccount } from "@/lib/account/use-account";
import {
  CODE_LENGTH,
  canResend,
  initialLoginState,
  type LoginStep,
  loginReducer,
  normalizeCode,
} from "@/lib/auth/login-state";
import {
  type AuthProblem,
  classifyAuthError,
  problemMessage,
} from "@/lib/auth/problems";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign in and sign up in one flow. The person gives an email; Supabase
 * sends one email with an 8-digit code and a link. Typing the code here
 * (`verifyOtp` with the email) works on any device, whichever browser the
 * email is read in. The link (/auth/confirm) signs in whichever browser
 * opens it. New accounts then pick a display name. Steps and messages live
 * in lib/auth/login-state.ts and lib/auth/problems.ts.
 */
export function LoginForm({
  enabled,
  next,
  initialStep,
  initialProblem,
}: {
  enabled: boolean;
  next: string;
  initialStep?: LoginStep;
  initialProblem?: AuthProblem | null;
}) {
  const [state, dispatch] = useReducer(loginReducer, undefined, () =>
    initialLoginState({
      step: initialStep,
      problem: initialProblem ? { problem: initialProblem } : null,
    }),
  );
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const now = useClock(state.resendAfter);
  const field = useRef<HTMLInputElement>(null);

  // Each step puts the cursor in its one field.
  useEffect(() => {
    if (state.step !== "done") field.current?.focus();
  }, [state.step]);

  // A full load, so every server component sees the new session.
  useEffect(() => {
    if (state.step === "done") window.location.assign(next);
  }, [state.step, next]);

  if (!enabled) {
    return (
      <>
        <h1 className={s.title}>Sign in to Shalom</h1>
        <p className={s.lead}>
          Sign-in isn't set up here yet. Add the Supabase keys to{" "}
          <code>.env.local</code> (see README).
        </p>
      </>
    );
  }

  const send = async (address: string) => {
    const supabase = createClient();
    if (!supabase) return;
    dispatch({ type: "send" });
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        // /auth/callback serves both email styles: Supabase's own link
        // (redirects here with ?code=, same browser only) and our
        // token_hash link, which src/proxy.ts forwards to /auth/confirm.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      dispatch({
        type: "send_failed",
        email: address,
        problem: classifyAuthError(error, "send"),
        at: Date.now(),
      });
      return;
    }
    setCode("");
    dispatch({ type: "sent", email: address, at: Date.now() });
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) return;
    dispatch({ type: "verify" });
    const { error } = await supabase.auth.verifyOtp({
      email: state.email,
      token: normalizeCode(code),
      type: "email",
    });
    if (error) {
      dispatch({
        type: "verify_failed",
        problem: classifyAuthError(error, "verify"),
      });
      return;
    }
    const account = await refreshAccount();
    dispatch({
      type: "verified",
      needsName:
        account.status === "signed-in" &&
        account.canSave &&
        !account.account.displayName,
    });
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: "save_name" });
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name }),
    }).catch(() => null);
    if (res?.ok) dispatch({ type: "name_saved" });
    else
      dispatch({
        type: "name_failed",
        problem: { problem: res ? "unknown" : "network" },
      });
  };

  const problem = state.problem && (
    <p id="login-problem" role="alert" className={s.problem}>
      {problemMessage(state.problem)}
    </p>
  );
  const describedBy = state.problem ? "login-problem" : undefined;

  if (state.step === "email") {
    const offerCode =
      state.problem !== null &&
      [
        "email_limit",
        "link_invalid",
        "link_other_browser",
        "link_missing",
      ].includes(state.problem.problem);
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(email.trim());
        }}
      >
        <h1 className={s.title}>Sign in to Shalom</h1>
        <p className={s.lead}>
          We'll email you a sign-in link and code. New here? The same steps
          create your account.
        </p>
        {problem}
        <label htmlFor="login-email" className={`${s.label} mt-5`}>
          Email
        </label>
        <input
          ref={field}
          id="login-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={describedBy}
          className={s.input}
        />
        <button type="submit" disabled={state.busy} className={s.primary}>
          {state.busy ? "Sending…" : "Continue"}
        </button>
        {offerCode && (
          <p className="mt-4 text-center">
            <button
              type="button"
              className={s.textButton}
              onClick={(e) => {
                const form = e.currentTarget.form;
                if (form && !form.reportValidity()) return;
                dispatch({ type: "have_code", email: email.trim() });
              }}
            >
              I already have a code
            </button>
          </p>
        )}
      </form>
    );
  }

  if (state.step === "code") {
    const wait = Math.ceil((state.resendAfter - now) / 1000);
    return (
      <form onSubmit={verify}>
        <h1 className={s.title}>Check your email</h1>
        <p className={s.lead}>
          {state.sent ? "We sent an email to " : "Use the email we sent to "}
          <span className="font-semibold break-all">{state.email}</span>. Type
          its code here, or open its link on the device you want to use.
        </p>
        {problem}
        <label htmlFor="login-code" className={`${s.label} mt-5`}>
          {CODE_LENGTH}-digit code
        </label>
        <input
          ref={field}
          id="login-code"
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9 \-]*"
          maxLength={CODE_LENGTH + 4}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={state.problem?.problem === "code_invalid" || undefined}
          className={`${s.input} font-medium text-lg tracking-[0.25em] tabular-nums`}
        />
        <button
          type="submit"
          disabled={state.busy || normalizeCode(code).length < 6}
          className={s.primary}
        >
          {state.busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-2">
          <button
            type="button"
            className={s.textButton}
            disabled={!canResend(state, now)}
            onClick={() => void send(state.email)}
          >
            {wait > 0 ? `New code in ${wait}s` : "Send a new code"}
          </button>
          <button
            type="button"
            className={s.textButton}
            onClick={() => {
              setCode("");
              dispatch({ type: "change_email" });
            }}
          >
            Use another email
          </button>
        </div>
      </form>
    );
  }

  if (state.step === "name") {
    return (
      <form onSubmit={saveName}>
        <h1 className={s.title}>What should we call you?</h1>
        <p className={s.lead}>A first name is plenty.</p>
        {problem}
        <label htmlFor="login-name" className={`${s.label} mt-5`}>
          Name
        </label>
        <input
          ref={field}
          id="login-name"
          required
          autoComplete="given-name"
          maxLength={DISPLAY_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-describedby={describedBy}
          className={s.input}
        />
        <button
          type="submit"
          disabled={state.busy || !name.trim()}
          className={s.primary}
        >
          {state.busy ? "Saving…" : "Continue"}
        </button>
        <p className="mt-4 text-center">
          <button
            type="button"
            className={s.textButton}
            onClick={() => window.location.assign(next)}
          >
            Skip for now
          </button>
        </p>
      </form>
    );
  }

  return <output className={`block ${s.lead}`}>Signing you in…</output>;
}

/** Now, ticking each second until `until` passes (for the resend countdown). */
function useClock(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  return now;
}
