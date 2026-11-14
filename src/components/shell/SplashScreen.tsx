"use client";

import { useEffect, useState } from "react";
import { BibleChatIcon } from "./BrandIcon";

const SEEN_KEY = "sholam:splash-seen";
const HOLD_MS = 1900;
const FADE_MS = 650;

/**
 * Launch screen, shown once per browser session: the mark draws itself,
 * the wordmark gets a sweep of white light, then the screen fades into the
 * app.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"show" | "leaving" | "gone">("show");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage can be unavailable (private mode); just play the intro.
    }
    if (seen) {
      setPhase("gone");
      return;
    }
    // Mark it seen only once it has played, so React's dev-mode double
    // effect run doesn't skip it.
    const leave = window.setTimeout(() => {
      setPhase("leaving");
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
    }, HOLD_MS);
    const done = window.setTimeout(() => setPhase("gone"), HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden
      className="splash fixed inset-0 z-[100] flex flex-col items-center justify-center"
      data-leaving={phase === "leaving" ? "" : undefined}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div className="splash-glow" />
      <div className="relative flex flex-col items-center gap-5">
        <BibleChatIcon
          className="splash-mark text-[84px] text-white"
          strokeWidth={1.6}
        />
        <span className="splash-word font-semibold text-4xl tracking-tight">
          sholam
        </span>
      </div>
      <span className="splash-tag absolute bottom-10 text-sm text-white/70 tracking-[0.2em]">
        ASK · LEARN · ABIDE
      </span>
    </div>
  );
}
