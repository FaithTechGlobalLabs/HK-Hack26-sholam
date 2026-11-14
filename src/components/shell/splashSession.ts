/**
 * Once-per-browser-session bookkeeping for the launch screen
 * (SplashScreen.tsx).
 *
 * The flag is a session cookie (no Expires or Max-Age), so every tab and
 * every shared link opened in the same browser session sees it, and the
 * browser drops it when the session ends. sessionStorage is a per-tab
 * fallback for browsers that block cookies. Both can throw when blocked, so
 * every access is guarded: if both fail, the splash simply plays again.
 */

/** Session cookie set once the launch screen has played (or was skipped). */
export const SPLASH_COOKIE = "shalom_launch";

/** The full `document.cookie` write: no Expires/Max-Age, so session-only. */
export const SPLASH_SEEN_COOKIE = `${SPLASH_COOKIE}=1; Path=/; SameSite=Lax`;

/** Finds the flag in `document.cookie` ("a=1; shalom_launch=1; b=2"). */
export const SPLASH_COOKIE_PATTERN = /(?:^|;\s*)shalom_launch=1(?:;|$)/;

/** Per-tab fallback key in sessionStorage, for when cookies are blocked. */
export const SPLASH_SEEN_KEY = "shalom:splash-seen";

/**
 * Put on `<html>` by the pre-paint script when the splash already played
 * this browser session; splash.css hides the splash under it, so a later
 * load never flashes it before React hydrates.
 */
export const SPLASH_SEEN_ATTR = "data-splash-seen";

/** Milliseconds. Keep in step with the `.launch` animations in splash.css. */
export const SPLASH_TIMING = {
  default: { leaveMs: 1600, fadeMs: 500 },
  reducedMotion: { leaveMs: 1200, fadeMs: 250 },
  /** Tap or key to skip: the exit starts at once. */
  skip: { fadeMs: 250 },
} as const;

/** What the flag needs from the browser; tests pass fakes. */
export interface SplashFlagStore {
  readCookie(): string;
  writeCookie(cookie: string): void;
  /** Reading `sessionStorage` itself throws when storage is blocked. */
  session(): Pick<Storage, "getItem" | "setItem">;
}

const browserStore: SplashFlagStore = {
  readCookie: () => document.cookie,
  writeCookie: (cookie) => {
    // biome-ignore lint/suspicious/noDocumentCookie: the pre-paint script must read the flag synchronously, so it is written the same way; Cookie Store is async.
    document.cookie = cookie;
  },
  session: () => globalThis.sessionStorage,
};

export function hasSeenSplash(store: SplashFlagStore = browserStore) {
  try {
    if (SPLASH_COOKIE_PATTERN.test(store.readCookie())) return true;
  } catch {
    // Cookies blocked: fall through to sessionStorage.
  }
  try {
    return store.session().getItem(SPLASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSplashSeen(store: SplashFlagStore = browserStore) {
  try {
    store.writeCookie(SPLASH_SEEN_COOKIE);
  } catch {
    // Cookies blocked: sessionStorage below still covers this tab.
  }
  try {
    store.session().setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Storage blocked too: the splash plays again next load. It is short.
  }
}

/**
 * Runs while the HTML is parsed, before first paint and before React. It
 * only reads, with the same checks as hasSeenSplash; the flag is written
 * when the splash finishes or is skipped. An IIFE so it leaves no globals.
 */
export const SPLASH_PRE_PAINT_SCRIPT = `(function(){try{var s=false;try{s=${SPLASH_COOKIE_PATTERN}.test(document.cookie)}catch(e){}if(!s)try{s=sessionStorage.getItem(${JSON.stringify(SPLASH_SEEN_KEY)})==="1"}catch(e){}if(s)document.documentElement.setAttribute(${JSON.stringify(SPLASH_SEEN_ATTR)},"")}catch(e){}})()`;
