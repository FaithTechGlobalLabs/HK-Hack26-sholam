/**
 * OpenRouter free-model limits (docs checked 2026-11-14): 20 requests/minute;
 * 50/day for accounts that bought under 10 credits, 1000/day from 10 credits
 * (this account bought 15). The day is shared across free models. Paid model
 * ids are not in that cap. Our own ceiling is in limits.ts (usage).
 */

export function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
}

/** Stay under the 20/minute free cap, including tool follow-up calls. */
export const FREE_MINUTE_BUDGET = 16;
export const FREE_MIN_GAP_MS = 3_200;

export interface RateLimitDecision {
  action: "retry" | "fail";
  waitMs: number;
  message: string;
}

const BRIEF =
  "Shalom Guide is briefly busy. Wait a few seconds and send that again.";

const DAILY =
  "Today's free OpenRouter allowance is used up. Every free model shares that cap, so switching models does not reset it. It resets at midnight UTC. Please try again tomorrow.";

/**
 * Decide whether a 429 should be retried. A long reset is the daily cap:
 * waiting will not help. A short Retry-After is the per-minute window.
 */
export function planRateLimit(
  headers: { get(name: string): string | null },
  attempt: number,
  now = Date.now(),
): RateLimitDecision {
  const remaining = headers.get("x-ratelimit-remaining");
  const resetRaw = Number(headers.get("x-ratelimit-reset"));
  const retryAfterSec = Number(headers.get("retry-after"));
  const resetIn = Number.isFinite(resetRaw) ? resetRaw - now : Number.NaN;

  if (remaining === "0" && resetIn > 60_000) {
    return { action: "fail", waitMs: 0, message: DAILY };
  }

  if (attempt >= 2) {
    return { action: "fail", waitMs: 0, message: BRIEF };
  }

  let waitMs = 1000 * 2 ** attempt;
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    waitMs = retryAfterSec * 1000;
  } else if (resetIn > 0 && resetIn < 20_000) {
    waitMs = resetIn + 250;
  }
  return {
    action: "retry",
    waitMs: Math.min(Math.max(waitMs, 400), 8_000),
    message: BRIEF,
  };
}
