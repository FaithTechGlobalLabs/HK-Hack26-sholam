import { connection } from "next/server";
import { isCustomerId, isDeviceId } from "@/lib/billing/plans";
import { findEntitlement } from "@/lib/billing/store";
import { publicOrigin, stripeClient } from "@/lib/billing/stripe";

/** Customer Portal for the subscription already linked to this install. */
export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as {
    deviceId?: string;
    customerId?: string;
  } | null;
  if (!isDeviceId(body?.deviceId) || !isCustomerId(body?.customerId)) {
    return Response.json(
      { error: "Expected { deviceId, customerId }." },
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
  const row = await findEntitlement(body.deviceId, body.customerId);
  if (!row || row.customerId !== body.customerId) {
    return Response.json(
      { error: "No Shalom Plus subscription is saved on this install." },
      { status: 404 },
    );
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: body.customerId,
    return_url: `${publicOrigin(request)}/api/billing/return?portal=1`,
  });
  return Response.json({ url: portal.url });
}
