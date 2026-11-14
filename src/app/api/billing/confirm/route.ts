import { connection } from "next/server";
import { usageSnapshot } from "@/lib/billing/access";
import { fulfillCheckoutSession } from "@/lib/billing/fulfill";
import { isDeviceId, isSessionId } from "@/lib/billing/plans";
import { stripeClient } from "@/lib/billing/stripe";

/**
 * The app calls this after Checkout redirects back. Access is granted only
 * when Stripe's own session says the payment is not unpaid, and the session
 * was started by this device. The webhook is still what keeps renewals,
 * failures, and cancellations up to date.
 */
export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    deviceId?: string;
  } | null;
  if (!isSessionId(body?.sessionId) || !isDeviceId(body?.deviceId)) {
    return Response.json(
      { error: "Expected { sessionId, deviceId }." },
      { status: 400 },
    );
  }
  const stripe = stripeClient();
  if (!stripe) {
    return Response.json(
      {
        error: "Stripe is not configured yet.",
        missing: ["STRIPE_SECRET_KEY"],
      },
      { status: 503 },
    );
  }
  const session = await stripe.checkout.sessions.retrieve(body.sessionId);
  if (session.client_reference_id !== body.deviceId) {
    return Response.json(
      { error: "This Checkout session belongs to a different install." },
      { status: 403 },
    );
  }
  if (session.payment_status !== "unpaid") {
    await fulfillCheckoutSession(session);
  }
  const usage = await usageSnapshot(body.deviceId, null);
  return Response.json({
    usage,
    pending: session.payment_status === "unpaid",
  });
}
