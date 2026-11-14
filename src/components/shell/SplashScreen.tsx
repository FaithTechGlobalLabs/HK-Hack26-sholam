"use client";

import { type AnimationEvent, useLayoutEffect, useState } from "react";
import { LogoMarkParts } from "@/components/brand/Logo";
import { BRAND_NAME } from "@/lib/brand";
import {
  hasSeenSplash,
  markSplashSeen,
  SPLASH_PRE_PAINT_SCRIPT,
  SPLASH_TIMING,
} from "./splashSession";
import "./splash.css";

/**
 * Launch screen, once per browser session (ported from Jeff's 30df585 with
 * the real mark): the cross draws out from its centre, the billows rise
 * left to right, light sweeps across the wordmark, then the screen fades
 * into the app.
 *
 * It can never strand the app behind it:
 * - A reload in the same session hides it before first paint: the inline
 *   script marks `<html>` and splash.css hides it under that mark.
 * - The fade-out is pure CSS (1.6 s hold, 0.5 s fade; reduced motion: 1.2 s,
 *   0.25 s) and ends invisible with `pointer-events: none`, so it leaves even
 *   if JavaScript never runs. JavaScript only unmounts it afterwards.
 *
 * Usage: render once in the app shell, `<SplashScreen />`.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "leaving" | "gone">("show");

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
    const leave = window.setTimeout(() => setPhase("leaving"), leaveMs);
    const done = window.setTimeout(() => {
      markSplashSeen();
      setPhase("gone");
    }, leaveMs + fadeMs);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      event.animationName === "launch-out"
    ) {
      markSplashSeen();
      setPhase("gone");
    }
  };

  return (
    <>
      <PrePaintScript />
      <div
        aria-hidden="true"
        className="launch"
        data-leaving={phase === "leaving" ? "" : undefined}
        onAnimationEnd={onAnimationEnd}
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
