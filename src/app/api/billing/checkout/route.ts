import { connection } from "next/server";
import { priceIdFor } from "@/lib/billing/access";
import { isDeviceId, stripeConfigGaps } from "@/lib/billing/plans";
import {
  integrationIdentifier,
  publicOrigin,
  stripeClient,
} from "@/lib/billing/stripe";

/**
 * Stripe-hosted Checkout for Shalom Plus. The app opens `url`.
 * Tax is left off until a Stripe Tax registration exists; enabling
 * `automatic_tax` without one collects nothing and looks like success.
 */
export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as {
    interval?: string;
    deviceId?: string;
  } | null;
  const interval =
    body?.interval === "year"
      ? "year"
      : body?.interval === "month"
        ? "month"
        : null;
  if (!interval || !isDeviceId(body?.deviceId)) {
    return Response.json(
      { error: "Expected { interval: 'month' | 'year', deviceId }." },
      { status: 400 },
    );
  }
  const missing = stripeConfigGaps();
  const stripe = stripeClient();
  const price = priceIdFor(interval);
  if (!stripe || missing.length || !price) {
    return Response.json(
      {
        error:
          "Stripe is not ready yet. Add the missing server environment variables, then restart.",
        missing,
      },
      { status: 503 },
    );
  }

  const origin = publicOrigin(request);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: body.deviceId,
    success_url: `${origin}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/api/billing/return?canceled=1`,
    integration_identifier: integrationIdentifier(),
  });

  if (!session.url) {
    return Response.json(
      { error: "Stripe did not return a Checkout link." },
      { status: 502 },
    );
  }
  return Response.json({ url: session.url });
}
