import type Stripe from "stripe";
import { isDeviceId, isPlusStatus, type PlanId } from "./plans";
import {
  type Entitlement,
  findEntitlement,
  updateEntitlementsWhere,
  upsertEntitlement,
} from "./store";
import { stripeClient, stripeId } from "./stripe";

export function periodEnd(subscription: Stripe.Subscription): string | null {
  const end = subscription.items.data[0]?.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}

export function priceIdOf(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price.id ?? null;
}

export function subscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | null {
  return stripeId(invoice.parent?.subscription_details?.subscription ?? null);
}

/**
 * Grants Plus from a Checkout Session Stripe has already marked as paid
 * (or no payment required). Called from the webhook and from the confirm
 * route, which re-reads the session from Stripe rather than trusting the app.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<Entitlement | null> {
  if (session.mode !== "subscription") return null;
  if (session.payment_status === "unpaid") return null;
  const deviceId = session.client_reference_id;
  if (!isDeviceId(deviceId)) return null;

  const stripe = stripeClient();
  const subscriptionId = stripeId(session.subscription);
  let status = "active";
  let priceId: string | null = null;
  let currentPeriodEnd: string | null = null;
  let customerId = stripeId(session.customer);

  if (stripe && subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    status = subscription.status;
    priceId = priceIdOf(subscription);
    currentPeriodEnd = periodEnd(subscription);
    customerId = stripeId(subscription.customer) ?? customerId;
  }

  const row: Entitlement = {
    deviceId,
    customerId,
    subscriptionId,
    status,
    priceId,
    currentPeriodEnd,
    updatedAt: new Date().toISOString(),
  };
  await upsertEntitlement(row);
  return row;
}

/** Copies a Subscription onto every install already tied to it. */
export async function applySubscription(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = stripeId(subscription.customer);
  const patch = {
    status: subscription.status,
    priceId: priceIdOf(subscription),
    currentPeriodEnd: periodEnd(subscription),
    customerId,
    subscriptionId: subscription.id,
  };
  const bySubscription = await updateEntitlementsWhere(
    { subscriptionId: subscription.id },
    patch,
  );
  if (bySubscription === 0 && customerId) {
    await updateEntitlementsWhere({ customerId }, patch);
  }
}

export async function markCustomerStatus(
  customerId: string,
  status: string,
): Promise<void> {
  const existing = await findEntitlement("", customerId);
  await updateEntitlementsWhere(
    { customerId },
    {
      status,
      priceId: existing?.priceId ?? null,
      currentPeriodEnd: existing?.currentPeriodEnd ?? null,
      customerId,
      subscriptionId: existing?.subscriptionId ?? null,
    },
  );
}

export async function customerIdFromCharge(
  charge: Stripe.Charge,
): Promise<string | null> {
  const direct = stripeId(charge.customer);
  if (direct) return direct;
  const paymentIntentId = stripeId(charge.payment_intent);
  const stripe = stripeClient();
  if (!stripe || !paymentIntentId) return null;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return stripeId(intent.customer);
}

export function planOf(status: string | null | undefined): PlanId {
  return isPlusStatus(status) ? "plus" : "free";
}
