import { describe, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/agent/limits";
import {
  admitTurn,
  type CounterStore,
  createMemoryCounterStore,
  dayPeriod,
  GLOBAL_DAY_MESSAGE,
  hourPeriod,
  reserveModelCall,
  VISITOR_DAY_MESSAGE,
  VISITOR_HOUR_MESSAGE,
  visitorKey,
  withFallback,
} from "@/lib/agent/usage-limit";

const now = new Date("2026-11-14T05:30:00Z");

describe("visitorKey", () => {
  it("uses the signed-in user id when there is one", () => {
    expect(visitorKey(new Headers(), "user-1", "s")).toBe("u:user-1");
  });

  it("hashes the IP with a secret and never returns it raw", () => {
    const h = new Headers({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "192.0.2.5, 10.0.0.1",
    });
    const key = visitorKey(h, null, "secret");
    expect(key).toMatch(/^ip:[A-Za-z0-9_-]{22}$/);
    expect(key).not.toContain("203.0.113.9");
    expect(key).toBe(
      visitorKey(
        new Headers({ "x-vercel-forwarded-for": "203.0.113.9" }),
        null,
        "secret",
      ),
    );
    expect(key).not.toBe(visitorKey(h, null, "other-secret"));
    expect(
      visitorKey(new Headers({ "x-real-ip": "198.51.100.1" }), null, "secret"),
    ).not.toBe(key);
    expect(
      visitorKey(
        new Headers({ "x-forwarded-for": "192.0.2.5, 10.0.0.1" }),
        null,
        "s",
      ),
    ).toBe(
      visitorKey(new Headers({ "x-forwarded-for": "192.0.2.5" }), null, "s"),
    );
  });
});

describe("periods", () => {
  it("are UTC hour and day windows", () => {
    expect(hourPeriod(now)).toBe("h:2026-11-14T05");
    expect(dayPeriod(now)).toBe("d:2026-11-14");
  });
});

describe("admitTurn", () => {
  it("allows a visitor up to the hourly limit, then explains", async () => {
    const store = createMemoryCounterStore();
    for (let i = 0; i < LIMITS.usage.visitorTurnsPerHour; i++)
      expect(await admitTurn(store, "ip:a", { now })).toEqual({ ok: true });
    const denied = await admitTurn(store, "ip:a", { now });
    expect(denied).toMatchObject({ ok: false, message: VISITOR_HOUR_MESSAGE });
    expect(denied.ok === false && denied.retryAfterSec).toBe(1800);
    // Someone else is unaffected.
    expect(await admitTurn(store, "ip:b", { now })).toEqual({ ok: true });
  });

  it("applies the daily limit across hours", async () => {
    const store = createMemoryCounterStore();
    await store.increment(
      [{ subject: "u:x", period: dayPeriod(now) }],
      LIMITS.usage.visitorTurnsPerDay,
    );
    expect(await admitTurn(store, "u:x", { now })).toMatchObject({
      ok: false,
      message: VISITOR_DAY_MESSAGE,
    });
  });

  it("stops everyone once the global model-call ceiling is reached", async () => {
    const store = createMemoryCounterStore();
    const env = { SHOLAM_DAILY_MODEL_CALLS: "3" };
    expect(await reserveModelCall(store, { now, env })).toBe(true);
    expect(await reserveModelCall(store, { now, env })).toBe(true);
    expect(await admitTurn(store, "ip:a", { now, env })).toEqual({ ok: true });
    expect(await reserveModelCall(store, { now, env })).toBe(true);
    expect(await reserveModelCall(store, { now, env })).toBe(false);
    expect(await admitTurn(store, "ip:new", { now, env })).toMatchObject({
      ok: false,
      message: GLOBAL_DAY_MESSAGE,
    });
    // A new UTC day starts fresh.
    const tomorrow = new Date("2026-11-15T00:00:01Z");
    expect(await admitTurn(store, "ip:new", { now: tomorrow, env })).toEqual({
      ok: true,
    });
  });

  it("lets turns through when the store fails", async () => {
    const broken: CounterStore = {
      increment: vi.fn(async () => {
        throw new Error('relation "usage_counters" does not exist');
      }),
      read: vi.fn(async () => [0]),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await admitTurn(broken, "ip:a", { now })).toEqual({ ok: true });
    expect(await reserveModelCall(broken, { now })).toBe(true);
    warn.mockRestore();
  });
});

describe("withFallback", () => {
  it("keeps limiting per instance while the table is missing, then retries", async () => {
    let clock = 0;
    let tableExists = false;
    const real = createMemoryCounterStore();
    const primary: CounterStore = {
      increment: vi.fn(async (keys, by) => {
        if (!tableExists)
          throw new Error('relation "usage_counters" does not exist');
        return real.increment(keys, by);
      }),
      read: vi.fn(async (keys) => real.read(keys)),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = withFallback(primary, createMemoryCounterStore(), {
      retryMs: 1000,
      now: () => clock,
    });

    for (let i = 0; i < LIMITS.usage.visitorTurnsPerHour; i++)
      expect(await admitTurn(store, "ip:a", { now })).toEqual({ ok: true });
    expect(await admitTurn(store, "ip:a", { now })).toMatchObject({
      ok: false,
    });
    // One failed query, then memory only, and one warning.
    expect(primary.increment).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    tableExists = true;
    clock = 1001;
    expect(await admitTurn(store, "ip:b", { now })).toEqual({ ok: true });
    expect(primary.increment).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
