import Stripe from "stripe";

const API_VERSION = "2026-10-28.endive" as const;

let client: Stripe | undefined;
let clientKey = "";

/**
 * One Stripe client for the process. The key stays on the server.
 * Prefer a restricted key (`rk_`) with Checkout, Customers, Subscriptions,
 * Prices, and the Billing Portal. Never ship this key in the iOS app.
 */
export function stripeClient(
  env: Record<string, string | undefined> = process.env,
): Stripe | null {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    clientKey = key;
    client = new Stripe(key, { apiVersion: API_VERSION });
  }
  return client;
}

const alphabet = "abcdefghijklmnopqrstuvwxyz";

function randomLetters(count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Stable for this process unless SHOLAM_STRIPE_INTEGRATION_ID is set. */
export function integrationIdentifier(
  env: Record<string, string | undefined> = process.env,
): string {
  const set = env.SHOLAM_STRIPE_INTEGRATION_ID?.trim();
  if (set) return set;
  flow ??= `shalom_ios_plus_${randomLetters(8)}`;
  return flow;
}

let flow: string | undefined;

export function stripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function publicOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.SHOLAM_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:5310";
}
