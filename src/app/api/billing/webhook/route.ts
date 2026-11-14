import { connection } from "next/server";
import type Stripe from "stripe";
import {
  applySubscription,
  customerIdFromCharge,
  fulfillCheckoutSession,
  markCustomerStatus,
  subscriptionIdFromInvoice,
} from "@/lib/billing/fulfill";
import { isDeviceId } from "@/lib/billing/plans";
import { upsertEntitlement } from "@/lib/billing/store";
import { stripeClient, stripeId } from "@/lib/billing/stripe";

/**
 * Subscription fulfillment. Required for renewals, failed payments,
 * cancellations, and delayed payment methods. Also pauses Plus on a
 * dispute, a full refund, or an early fraud warning.
 *
 * Stripe Dashboard endpoint: `{origin}/api/billing/webhook`
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, customer.subscription.updated,
 * customer.subscription.deleted, invoice.paid, invoice.payment_failed,
 * charge.dispute.created, charge.dispute.closed, charge.refunded,
 * radar.early_fraud_warning.created.
 */
export async function POST(request: Request) {
  await connection();
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return Response.json(
      { error: "Stripe webhook is not configured." },
      { status: 503 },
    );
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return Response.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  try {
    await dispatch(event);
  } catch (err) {
    console.warn(
      "[billing] webhook failed",
      err instanceof Error ? err.name : "error",
    );
    return Response.json({ error: "Webhook handler failed." }, { status: 500 });
  }
  return Response.json({ received: true });
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.payment_status !== "unpaid") {
        await fulfillCheckoutSession(session);
      }
      return;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      if (!isDeviceId(session.client_reference_id)) return;
      await upsertEntitlement({
        deviceId: session.client_reference_id,
        customerId: stripeId(session.customer),
        subscriptionId: stripeId(session.subscription),
        status: "incomplete",
        priceId: null,
        currentPeriodEnd: null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = subscriptionIdFromInvoice(event.data.object);
      const stripe = stripeClient();
      if (!stripe || !subscriptionId) return;
      await applySubscription(
        await stripe.subscriptions.retrieve(subscriptionId),
      );
      return;
    }
    case "charge.dispute.created": {
      const customerId = await customerFromChargeRef(event.data.object.charge);
      if (customerId) await markCustomerStatus(customerId, "disputed");
      return;
    }
    case "charge.dispute.closed": {
      const customerId = await customerFromChargeRef(event.data.object.charge);
      if (!customerId) return;
      if (event.data.object.status === "won") {
        await refreshCustomerSubscriptions(customerId);
      } else {
        await markCustomerStatus(customerId, "disputed");
      }
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      if (!charge.refunded) return;
      const customerId = await customerIdFromCharge(charge);
      if (customerId) await markCustomerStatus(customerId, "refunded");
      return;
    }
    case "radar.early_fraud_warning.created": {
      const customerId = await customerFromChargeRef(event.data.object.charge);
      if (customerId) await markCustomerStatus(customerId, "review");
      return;
    }
    default:
      return;
  }
}

async function customerFromChargeRef(
  charge: string | Stripe.Charge,
): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  const full =
    typeof charge === "string" ? await stripe.charges.retrieve(charge) : charge;
  return customerIdFromCharge(full);
}

async function refreshCustomerSubscriptions(customerId: string): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  for (const subscription of list.data) {
    await applySubscription(subscription);
  }
}
