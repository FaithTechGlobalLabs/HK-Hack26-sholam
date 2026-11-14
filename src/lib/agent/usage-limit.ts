/**
 * Per-visitor and global usage limits for `/api/chat`, enforced across
 * serverless instances through a counter store (Postgres in production,
 * memory without DATABASE_URL). Pure logic: the store is injected, so this
 * file is safe to test. Numbers are in LIMITS.usage.
 */

import { createHmac } from "node:crypto";
import { dailyModelCallCeiling, LIMITS } from "./limits";

export interface CounterStore {
  /** Adds `by` to each (subject, period) counter and returns the new counts, in order. */
  increment(
    keys: { subject: string; period: string }[],
    by?: number,
  ): Promise<number[]>;
  /** Current counts, 0 when missing. */
  read(keys: { subject: string; period: string }[]): Promise<number[]>;
}

export type Allowance =
  | { ok: true }
  | { ok: false; message: string; retryAfterSec: number };

export const VISITOR_HOUR_MESSAGE =
  "You've asked a lot of questions in the last hour. Take a short break and try again in a little while.";
export const VISITOR_DAY_MESSAGE =
  "You've reached today's question limit. Please come back tomorrow.";
export const GLOBAL_DAY_MESSAGE =
  "Shalom Guide has answered as many questions as it can for today. It resets at midnight UTC. Please come back then.";

const GLOBAL = "global";

export function dayPeriod(now: Date): string {
  return `d:${now.toISOString().slice(0, 10)}`;
}

export function hourPeriod(now: Date): string {
  return `h:${now.toISOString().slice(0, 13)}`;
}

function secondsToNextHour(now: Date): number {
  return 3600 - (Math.floor(now.getTime() / 1000) % 3600);
}

function secondsToNextUtcDay(now: Date): number {
  return 86_400 - (Math.floor(now.getTime() / 1000) % 86_400);
}

/**
 * Who is asking: the signed-in user id, else a keyed hash of the client IP
 * (Vercel's `x-vercel-forwarded-for`, then `x-real-ip`, then the first
 * `x-forwarded-for` hop). The raw IP is never returned or stored.
 */
export function visitorKey(
  headers: Headers,
  userId: string | null,
  secret: string,
): string {
  if (userId) return `u:${userId}`;
  const first = (value: string | null) => value?.split(",")[0]?.trim() || "";
  const ip =
    first(headers.get("x-vercel-forwarded-for")) ||
    first(headers.get("x-real-ip")) ||
    first(headers.get("x-forwarded-for")) ||
    "unknown";
  const hash = createHmac("sha256", secret).update(ip).digest("base64url");
  return `ip:${hash.slice(0, 22)}`;
}

/** Key for the IP hash: a dedicated salt if set, else another server secret. */
export function visitorHashSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.SHOLAM_RATE_LIMIT_SALT ||
    env.DATABASE_URL ||
    env.OPENROUTER_API_KEY ||
    "sholam-local-dev"
  );
}

/**
 * Counts one turn for the visitor and checks the visitor's hourly and daily
 * limits and the global daily model-call ceiling. A store failure lets the
 * turn through (OpenRouter's own limit still applies).
 */
export async function admitTurn(
  store: CounterStore,
  visitor: string,
  options: { now?: Date; env?: Record<string, string | undefined> } = {},
): Promise<Allowance> {
  const now = options.now ?? new Date();
  try {
    const [hour, day] = await store.increment([
      { subject: visitor, period: hourPeriod(now) },
      { subject: visitor, period: dayPeriod(now) },
    ]);
    if (day > LIMITS.usage.visitorTurnsPerDay)
      return {
        ok: false,
        message: VISITOR_DAY_MESSAGE,
        retryAfterSec: secondsToNextUtcDay(now),
      };
    if (hour > LIMITS.usage.visitorTurnsPerHour)
      return {
        ok: false,
        message: VISITOR_HOUR_MESSAGE,
        retryAfterSec: secondsToNextHour(now),
      };
    const [global] = await store.read([
      { subject: GLOBAL, period: dayPeriod(now) },
    ]);
    if (global >= dailyModelCallCeiling(options.env))
      return {
        ok: false,
        message: GLOBAL_DAY_MESSAGE,
        retryAfterSec: secondsToNextUtcDay(now),
      };
    return { ok: true };
  } catch (err) {
    console.warn("usage limit check failed; allowing the turn", errorName(err));
    return { ok: true };
  }
}

/** Counts one model request against the global daily ceiling; false once it is reached. */
export async function reserveModelCall(
  store: CounterStore,
  options: { now?: Date; env?: Record<string, string | undefined> } = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  try {
    const [count] = await store.increment([
      { subject: GLOBAL, period: dayPeriod(now) },
    ]);
    return count <= dailyModelCallCeiling(options.env);
  } catch (err) {
    console.warn(
      "usage counter failed; allowing the model call",
      errorName(err),
    );
    return true;
  }
}

function errorName(err: unknown): string {
  return err instanceof Error
    ? `${err.name}: ${err.message.slice(0, 120)}`
    : "unknown";
}

/**
 * Uses `primary` (Postgres) and, after it fails once (for example the
 * `usage_counters` table is not migrated yet), `fallback` (memory) for
 * `retryMs` before trying the primary again. Limits then hold per instance
 * instead of not at all, with one warning per outage, not one per request.
 */
export function withFallback(
  primary: CounterStore,
  fallback: CounterStore,
  options: { retryMs?: number; now?: () => number } = {},
): CounterStore {
  const retryMs = options.retryMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  let downUntil = 0;
  const run = async <T>(
    op: (store: CounterStore) => Promise<T>,
  ): Promise<T> => {
    if (now() < downUntil) return op(fallback);
    try {
      return await op(primary);
    } catch (err) {
      downUntil = now() + retryMs;
      console.warn(
        "usage counters unavailable; using per-instance memory for now",
        errorName(err),
      );
      return op(fallback);
    }
  };
  return {
    increment: (keys, by) => run((s) => s.increment(keys, by)),
    read: (keys) => run((s) => s.read(keys)),
  };
}

/** Per-process counters for local dev and CI (no DATABASE_URL). */
export function createMemoryCounterStore(): CounterStore {
  const counts = new Map<string, number>();
  const key = (k: { subject: string; period: string }) =>
    `${k.subject}|${k.period}`;
  return {
    async increment(keys, by = 1) {
      return keys.map((k) => {
        const next = (counts.get(key(k)) ?? 0) + by;
        counts.set(key(k), next);
        return next;
      });
    },
    async read(keys) {
      return keys.map((k) => counts.get(key(k)) ?? 0);
    },
  };
}
