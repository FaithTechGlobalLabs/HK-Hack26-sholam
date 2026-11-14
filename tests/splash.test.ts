import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  hasSeenSplash,
  markSplashSeen,
  SPLASH_COOKIE,
  SPLASH_PRE_PAINT_SCRIPT,
  SPLASH_SEEN_ATTR,
  SPLASH_SEEN_COOKIE,
  SPLASH_SEEN_KEY,
  SPLASH_TIMING,
  type SplashFlagStore,
} from "@/components/shell/splashSession";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

/** A cookie jar that behaves like `document.cookie` for name=value pairs. */
class MemoryCookies {
  private jar = new Map<string, string>();
  writes: string[] = [];
  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      this.jar.set(name, value);
    }
  }
  get cookie() {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  set cookie(written: string) {
    this.writes.push(written);
    const [pair] = written.split(";");
    const at = pair.indexOf("=");
    this.jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

const blocked = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

/** One browser session: a cookie jar shared by tabs, storage per tab. */
function tab(cookies: MemoryCookies, storage = new MemoryStorage()) {
  const store: SplashFlagStore = {
    readCookie: () => cookies.cookie,
    writeCookie: (cookie) => {
      cookies.cookie = cookie;
    },
    session: () => storage,
  };
  return { store, storage };
}

/** Runs the inline script the way the browser would, against fakes. */
function runPrePaint(readCookie: () => string, storage: unknown) {
  const setAttribute = vi.fn();
  const document = {
    get cookie() {
      return readCookie();
    },
    documentElement: { setAttribute },
  };
  new Function("document", "sessionStorage", SPLASH_PRE_PAINT_SCRIPT)(
    document,
    storage,
  );
  return setAttribute;
}

describe("launch screen session flag", () => {
  it("plays once per browser session, across tabs", () => {
    const cookies = new MemoryCookies();
    const first = tab(cookies);
    expect(hasSeenSplash(first.store)).toBe(false);
    markSplashSeen(first.store);
    expect(hasSeenSplash(first.store)).toBe(true);
    // A new tab or a shared link: fresh sessionStorage, same cookie jar.
    expect(hasSeenSplash(tab(cookies).store)).toBe(true);
    // A new browser session: session cookies and storage are gone.
    expect(hasSeenSplash(tab(new MemoryCookies()).store)).toBe(false);
  });

  it("writes a session cookie: no Expires or Max-Age, whole site, Lax", () => {
    const cookies = new MemoryCookies();
    markSplashSeen(tab(cookies).store);
    expect(cookies.writes).toEqual([SPLASH_SEEN_COOKIE]);
    expect(SPLASH_SEEN_COOKIE).toBe(`${SPLASH_COOKIE}=1; Path=/; SameSite=Lax`);
    expect(SPLASH_SEEN_COOKIE).not.toMatch(/expires|max-age/i);
  });

  it("finds the cookie among others and ignores look-alikes", () => {
    const seen = (initial: Record<string, string>) =>
      hasSeenSplash(tab(new MemoryCookies(initial)).store);
    expect(seen({ a: "x", [SPLASH_COOKIE]: "1", b: "y" })).toBe(true);
    expect(seen({ [SPLASH_COOKIE]: "1" })).toBe(true);
    expect(seen({ [`x${SPLASH_COOKIE}`]: "1" })).toBe(false);
    expect(seen({ [SPLASH_COOKIE]: "10" })).toBe(false);
    expect(seen({ [SPLASH_COOKIE]: "0" })).toBe(false);
  });

  it("falls back to this tab's sessionStorage when cookies are blocked", () => {
    const storage = new MemoryStorage();
    const store: SplashFlagStore = {
      readCookie: blocked,
      writeCookie: blocked,
      session: () => storage,
    };
    expect(hasSeenSplash(store)).toBe(false);
    expect(() => markSplashSeen(store)).not.toThrow();
    expect(storage.getItem(SPLASH_SEEN_KEY)).toBe("1");
    expect(hasSeenSplash(store)).toBe(true);
  });

  it("plays again, without throwing, when cookies and storage are blocked", () => {
    const store: SplashFlagStore = {
      readCookie: blocked,
      writeCookie: blocked,
      session: blocked,
    };
    expect(hasSeenSplash(store)).toBe(false);
    expect(() => markSplashSeen(store)).not.toThrow();
  });

  it("pre-paint script marks <html> only after the splash has played", () => {
    const cookies = new MemoryCookies({ other: "1" });
    const storage = new MemoryStorage();
    expect(runPrePaint(() => cookies.cookie, storage)).not.toHaveBeenCalled();
    markSplashSeen(tab(cookies, storage).store);
    expect(
      runPrePaint(() => cookies.cookie, new MemoryStorage()),
    ).toHaveBeenCalledWith(SPLASH_SEEN_ATTR, "");
  });

  it("pre-paint script reads sessionStorage when cookies are blocked", () => {
    const storage = new MemoryStorage();
    expect(runPrePaint(blocked, storage)).not.toHaveBeenCalled();
    storage.setItem(SPLASH_SEEN_KEY, "1");
    expect(runPrePaint(blocked, storage)).toHaveBeenCalledWith(
      SPLASH_SEEN_ATTR,
      "",
    );
  });

  it("pre-paint script survives blocked cookies and storage", () => {
    expect(() => runPrePaint(blocked, { getItem: blocked })).not.toThrow();
    expect(runPrePaint(blocked, { getItem: blocked })).not.toHaveBeenCalled();
  });

  it("pre-paint script leaves no globals behind", () => {
    expect(SPLASH_PRE_PAINT_SCRIPT).toMatch(/^\(function\(\)\{.*\}\)\(\)$/);
  });

  it("JS backstop timings match the CSS fades in splash.css", () => {
    const css = readFileSync(
      path.join(__dirname, "../src/components/shell/splash.css"),
      "utf8",
    );
    const full = css.match(
      /animation: launch-out ([\d.]+)s \S+ ([\d.]+)s forwards/,
    );
    const skip = css.match(/animation: launch-skip ([\d.]+)s \S+ forwards/);
    const reduced = css
      .slice(css.indexOf("prefers-reduced-motion"))
      .match(/animation-duration: ([\d.]+)s;\s*animation-delay: ([\d.]+)s;/);
    const ms = (s?: string) => Math.round(Number(s) * 1000);
    expect(ms(full?.[2])).toBe(SPLASH_TIMING.default.leaveMs);
    expect(ms(full?.[1])).toBe(SPLASH_TIMING.default.fadeMs);
    expect(ms(reduced?.[2])).toBe(SPLASH_TIMING.reducedMotion.leaveMs);
    expect(ms(reduced?.[1])).toBe(SPLASH_TIMING.reducedMotion.fadeMs);
    expect(ms(skip?.[1])).toBe(SPLASH_TIMING.skip.fadeMs);
  });
});
