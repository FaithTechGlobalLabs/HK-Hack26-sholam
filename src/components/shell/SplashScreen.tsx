"use client";

import {
  type AnimationEvent,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { LogoMarkParts } from "@/components/brand/Logo";
import { BRAND_NAME } from "@/lib/brand";
import {
  hasSeenSplash,
  markSplashSeen,
  SPLASH_PRE_PAINT_SCRIPT,
  SPLASH_TIMING,
} from "./splashSession";
import "./splash.css";

type Phase = "show" | "leaving" | "skipping" | "gone";

/** A tap or key only skips while the splash is still holding. */
const skip = (now: Phase): Phase => (now === "show" ? "skipping" : now);

/** The CSS exits; either one ending means the splash is invisible. */
const EXIT_ANIMATIONS = new Set(["launch-out", "launch-skip"]);

/**
 * Launch screen, once per browser session (ported from Jeff's 30df585 with
 * the real mark): the cross draws out from its centre, the billows rise
 * left to right, light sweeps across the wordmark, then the screen fades
 * into the app. "Seen" is a session cookie (splashSession.ts), so new tabs
 * and shared links in the same browser session skip it.
 *
 * It can never strand the app behind it:
 * - A later load in the same browser session hides it before first paint:
 *   the inline script marks `<html>` and splash.css hides it under that mark.
 * - Without JavaScript it is never shown (the `<noscript>` style).
 * - The fade-out is pure CSS (1.6 s hold, 0.5 s fade; reduced motion: 1.2 s,
 *   0.25 s) and ends invisible with `pointer-events: none`, so it leaves even
 *   if JavaScript stalls. JavaScript only unmounts it afterwards.
 * - A pointer down on it, or any key, starts a 0.25 s exit at once. It stays
 *   `aria-hidden` with nothing focusable; the dismissing tap is swallowed so
 *   it never lands on the app underneath.
 *
 * Usage: render once in the app shell, `<SplashScreen />`.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("show");
  const showing = phase === "show";

  // Layout effect: on a client-side mount (e.g. from /login) a seen splash
  // is dropped before the browser paints it.
  useLayoutEffect(() => {
    if (hasSeenSplash()) {
      setPhase("gone");
      return;
    }
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const { leaveMs, fadeMs } = reduce
      ? SPLASH_TIMING.reducedMotion
      : SPLASH_TIMING.default;
    // Backstops for the CSS: if animations are off, still let clicks through
    // and remove it on time. Marking it seen only after it has played keeps
    // React's dev-mode double effect from skipping it.
    const leave = window.setTimeout(
      () => setPhase((now) => (now === "show" ? "leaving" : now)),
      leaveMs,
    );
    const done = window.setTimeout(() => {
      markSplashSeen();
      setPhase("gone");
    }, leaveMs + fadeMs);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  // Any key skips while it holds. Capture phase, so an app handler that
  // stops propagation cannot hide the key from it.
  useEffect(() => {
    if (!showing) return;
    const onKeyDown = () => setPhase(skip);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [showing]);

  // Skipped: seen from now on; unmount once the quick fade is over (the
  // backstop for animations being off).
  useEffect(() => {
    if (phase !== "skipping") return;
    markSplashSeen();
    const done = window.setTimeout(
      () => setPhase("gone"),
      SPLASH_TIMING.skip.fadeMs,
    );
    return () => window.clearTimeout(done);
  }, [phase]);

  if (phase === "gone") return null;

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      EXIT_ANIMATIONS.has(event.animationName)
    ) {
      markSplashSeen();
      setPhase("gone");
    }
  };

  return (
    <>
      <PrePaintScript />
      <noscript>
        <style>{".launch{display:none}"}</style>
      </noscript>
      <div
        aria-hidden="true"
        className="launch"
        data-leaving={phase === "leaving" ? "" : undefined}
        data-skipped={phase === "skipping" ? "" : undefined}
        onAnimationEnd={onAnimationEnd}
        onPointerDown={() => setPhase(skip)}
      >
        <div className="launch-lockup">
          <LogoMarkParts className="launch-mark" />
          <div className="launch-word">{BRAND_NAME}</div>
          <div className="launch-tag">Ask. Learn. Abide.</div>
        </div>
      </div>
    </>
  );
}

/**
 * Next's inline-script pattern (node_modules/next/dist/docs, "Preventing
 * flash before hydration"): executable in the server HTML, inert
 * `text/plain` when React renders it on the client, which also avoids
 * React's warning about client-rendered `<script>` tags. Client mounts are
 * covered by the layout effect above.
 */
function PrePaintScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant string from splashSession.ts, no user data; it has to run before first paint.
      dangerouslySetInnerHTML={{ __html: SPLASH_PRE_PAINT_SCRIPT }}
    />
  );
}
