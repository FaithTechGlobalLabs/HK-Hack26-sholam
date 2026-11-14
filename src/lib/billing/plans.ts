/**
 * What the iOS app is allowed to do on each plan. Stripe charges whatever
 * Price you attach in the Dashboard; these numbers are the product limits
 * the app shows and the server enforces. They are not Stripe meters.
 */

export const FREE_QUESTIONS_PER_DAY = 8;
export const PLUS_QUESTIONS_PER_DAY = 60;
export const FREE_SAVED_CHATS = 5;
export const PLUS_SAVED_CHATS = 30;

export type PlanId = "free" | "plus";
export type BillingInterval = "month" | "year";

/** Stripe statuses that keep Shalom Plus. Anything else is the free plan. */
export function isPlusStatus(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function questionsPerDay(plan: PlanId): number {
  return plan === "plus" ? PLUS_QUESTIONS_PER_DAY : FREE_QUESTIONS_PER_DAY;
}

export function savedChatLimit(plan: PlanId): number {
  return plan === "plus" ? PLUS_SAVED_CHATS : FREE_SAVED_CHATS;
}

export function secondsUntilUtcMidnight(now = new Date()): number {
  return 86_400 - (Math.floor(now.getTime() / 1000) % 86_400);
}

export function nextUtcMidnight(now = new Date()): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

export function isDeviceId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export function isCustomerId(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && /^cus_[A-Za-z0-9]+$/.test(value);
}

export function isSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^cs_[A-Za-z0-9_]+$/.test(value);
}

/** Names of server env vars still needed before Checkout can charge. */
export function stripeConfigGaps(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const gaps: string[] = [];
  if (!env.STRIPE_SECRET_KEY?.trim()) gaps.push("STRIPE_SECRET_KEY");
  if (!env.STRIPE_WEBHOOK_SECRET?.trim()) gaps.push("STRIPE_WEBHOOK_SECRET");
  if (!env.STRIPE_PRICE_PLUS_MONTH?.trim())
    gaps.push("STRIPE_PRICE_PLUS_MONTH");
  if (!env.STRIPE_PRICE_PLUS_YEAR?.trim()) gaps.push("STRIPE_PRICE_PLUS_YEAR");
  return gaps;
}
