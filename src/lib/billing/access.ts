import { shouldUseLiveAgent } from "@/lib/agent/openrouter-config";
import { dayPeriod } from "@/lib/agent/usage-limit";
import { usageStore } from "@/lib/agent/usage-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { planOf } from "./fulfill";
import {
  type BillingInterval,
  isCustomerId,
  isPlusStatus,
  nextUtcMidnight,
  type PlanId,
  questionsPerDay,
  savedChatLimit,
  secondsUntilUtcMidnight,
  stripeConfigGaps,
} from "./plans";
import { findEntitlement } from "./store";
import { stripeClient } from "./stripe";

export interface UsageSnapshot {
  plan: PlanId;
  status: string;
  questionsUsed: number;
  questionsLimit: number;
  savedChatLimit: number;
  resetsAt: string;
  customerId: string | null;
  stripe: { ready: boolean; missing: string[] };
  supabase: "configured" | "unconfigured";
  ai: "live" | "demo";
  prices: { month: string | null; year: string | null };
}

export async function resolveAccess(
  deviceId: string,
  customerId: string | null,
): Promise<{ plan: PlanId; status: string; customerId: string | null }> {
  const row = await findEntitlement(deviceId, customerId);
  const status = row?.status ?? "inactive";
  return {
    plan: planOf(status),
    status,
    customerId:
      row?.customerId ?? (isCustomerId(customerId) ? customerId : null),
  };
}

export async function readQuestionCount(
  deviceId: string,
  now = new Date(),
): Promise<number> {
  const [used] = await usageStore().read([
    { subject: `ios:${deviceId}`, period: dayPeriod(now) },
  ]);
  return used ?? 0;
}

/**
 * Counts one iOS question and stops the free (or Plus) plan at its daily cap.
 * The existing visitor and global ceilings still apply after this returns ok.
 */
export async function admitIosQuestion(
  deviceId: string,
  customerId: string | null,
  now = new Date(),
): Promise<
  | { ok: true; plan: PlanId; used: number; limit: number }
  | {
      ok: false;
      plan: PlanId;
      used: number;
      limit: number;
      message: string;
      retryAfterSec: number;
    }
> {
  const access = await resolveAccess(deviceId, customerId);
  const limit = questionsPerDay(access.plan);
  const [used] = await usageStore().increment([
    { subject: `ios:${deviceId}`, period: dayPeriod(now) },
  ]);
  if (used > limit) {
    const message =
      access.plan === "plus"
        ? "You've reached today's question limit. It resets at midnight UTC."
        : "You've used today's free questions. Shalom Plus raises the daily limit.";
    return {
      ok: false,
      plan: access.plan,
      used,
      limit,
      message,
      retryAfterSec: secondsUntilUtcMidnight(now),
    };
  }
  return { ok: true, plan: access.plan, used, limit };
}

async function priceLabel(priceId: string | undefined): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe || !priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount == null) return null;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
    }).format(price.unit_amount / 100);
    const interval = price.recurring?.interval;
    return interval ? `${amount}/${interval}` : amount;
  } catch {
    return null;
  }
}

export async function usageSnapshot(
  deviceId: string,
  customerId: string | null,
): Promise<UsageSnapshot> {
  const access = await resolveAccess(deviceId, customerId);
  const missing = stripeConfigGaps();
  const [month, year] = await Promise.all([
    priceLabel(process.env.STRIPE_PRICE_PLUS_MONTH),
    priceLabel(process.env.STRIPE_PRICE_PLUS_YEAR),
  ]);
  const ai = shouldUseLiveAgent();
  return {
    plan: access.plan,
    status: access.status,
    questionsUsed: await readQuestionCount(deviceId),
    questionsLimit: questionsPerDay(access.plan),
    savedChatLimit: savedChatLimit(access.plan),
    resetsAt: nextUtcMidnight(),
    customerId: access.customerId,
    stripe: { ready: missing.length === 0, missing },
    supabase: isSupabaseConfigured() ? "configured" : "unconfigured",
    ai: ai.live && !ai.reason ? "live" : "demo",
    prices: { month, year },
  };
}

export function priceIdFor(interval: BillingInterval): string | undefined {
  return interval === "year"
    ? process.env.STRIPE_PRICE_PLUS_YEAR?.trim()
    : process.env.STRIPE_PRICE_PLUS_MONTH?.trim();
}

export function plusActive(status: string): boolean {
  return isPlusStatus(status);
}
