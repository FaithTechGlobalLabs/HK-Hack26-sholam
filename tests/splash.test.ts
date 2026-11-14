import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  hasSeenSplash,
  markSplashSeen,
  SPLASH_PRE_PAINT_SCRIPT,
  SPLASH_SEEN_ATTR,
  SPLASH_SEEN_KEY,
  SPLASH_TIMING,
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

const blocked = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

/** Runs the inline script the way the browser would, against fakes. */
function runPrePaint(storage: unknown) {
  const setAttribute = vi.fn();
  const run = new Function(
    "document",
    "sessionStorage",
    SPLASH_PRE_PAINT_SCRIPT,
  );
  run({ documentElement: { setAttribute } }, storage);
  return setAttribute;
}

describe("launch screen session flag", () => {
  it("plays once per session", () => {
    const storage = new MemoryStorage();
    expect(hasSeenSplash(() => storage)).toBe(false);
    markSplashSeen(() => storage);
    expect(hasSeenSplash(() => storage)).toBe(true);
    expect(storage.getItem(SPLASH_SEEN_KEY)).toBe("1");
  });

  it("plays again, without throwing, when storage is blocked", () => {
    expect(hasSeenSplash(blocked)).toBe(false);
    expect(() => markSplashSeen(blocked)).not.toThrow();
  });

  it("pre-paint script marks <html> only after the splash has played", () => {
    const storage = new MemoryStorage();
    expect(runPrePaint(storage)).not.toHaveBeenCalled();
    markSplashSeen(() => storage);
    expect(runPrePaint(storage)).toHaveBeenCalledWith(SPLASH_SEEN_ATTR, "");
  });

  it("pre-paint script survives blocked storage", () => {
    const throwing = { getItem: blocked };
    expect(runPrePaint(throwing)).not.toHaveBeenCalled();
  });

  it("JS backstop timings match the CSS fade in splash.css", () => {
    const css = readFileSync(
      path.join(__dirname, "../src/components/shell/splash.css"),
      "utf8",
    );
    const full = css.match(
      /animation: launch-out ([\d.]+)s \S+ ([\d.]+)s forwards/,
    );
    const reduced = css
      .slice(css.indexOf("prefers-reduced-motion"))
      .match(/animation-duration: ([\d.]+)s;\s*animation-delay: ([\d.]+)s;/);
    const ms = (s?: string) => Math.round(Number(s) * 1000);
    expect(ms(full?.[2])).toBe(SPLASH_TIMING.default.leaveMs);
    expect(ms(full?.[1])).toBe(SPLASH_TIMING.default.fadeMs);
    expect(ms(reduced?.[2])).toBe(SPLASH_TIMING.reducedMotion.leaveMs);
    expect(ms(reduced?.[1])).toBe(SPLASH_TIMING.reducedMotion.fadeMs);
  });
});
