/**
 * Once-per-session bookkeeping for the launch screen (SplashScreen.tsx).
 * sessionStorage is per tab and can be blocked (it throws then), so every
 * access is guarded: if it fails, the splash simply plays again.
 */

/** Set in sessionStorage once the launch screen has played in this tab. */
export const SPLASH_SEEN_KEY = "shalom:splash-seen";

/**
 * Put on `<html>` by the pre-paint script when the splash already played
 * this session; splash.css hides the splash under it, so a reload never
 * flashes it before React hydrates.
 */
export const SPLASH_SEEN_ATTR = "data-splash-seen";

/** Milliseconds. Keep in step with the `.launch` animation in splash.css. */
export const SPLASH_TIMING = {
  default: { leaveMs: 1600, fadeMs: 500 },
  reducedMotion: { leaveMs: 1200, fadeMs: 250 },
} as const;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** Reading `sessionStorage` itself throws when storage is blocked. */
const sessionStore = (): SessionStore => globalThis.sessionStorage;

export function hasSeenSplash(getStore: () => SessionStore = sessionStore) {
  try {
    return getStore().getItem(SPLASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen(getStore: () => SessionStore = sessionStore) {
  try {
    getStore().setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the splash plays again next load. It is short.
  }
}

/**
 * Runs while the HTML is parsed, before first paint and before React. It
 * only reads; the flag is written when the splash finishes playing.
 */
export const SPLASH_PRE_PAINT_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)})==="1")document.documentElement.setAttribute(${JSON.stringify(SPLASH_SEEN_ATTR)},"")}catch(e){}`;
