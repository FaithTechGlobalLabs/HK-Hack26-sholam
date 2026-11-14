import { describe, expect, it } from "vitest";
import {
  FREE_QUESTIONS_PER_DAY,
  FREE_SAVED_CHATS,
  isCustomerId,
  isDeviceId,
  isPlusStatus,
  PLUS_QUESTIONS_PER_DAY,
  PLUS_SAVED_CHATS,
  questionsPerDay,
  savedChatLimit,
  stripeConfigGaps,
} from "@/lib/billing/plans";

describe("iOS plan limits", () => {
  it("keeps Plus only while the subscription is active or trialing", () => {
    expect(isPlusStatus("active")).toBe(true);
    expect(isPlusStatus("trialing")).toBe(true);
    expect(isPlusStatus("past_due")).toBe(false);
    expect(isPlusStatus("canceled")).toBe(false);
    expect(isPlusStatus("disputed")).toBe(false);
    expect(isPlusStatus("refunded")).toBe(false);
    expect(isPlusStatus("review")).toBe(false);
  });

  it("gives Plus a higher daily question cap and more saved chats", () => {
    expect(questionsPerDay("free")).toBe(FREE_QUESTIONS_PER_DAY);
    expect(questionsPerDay("plus")).toBe(PLUS_QUESTIONS_PER_DAY);
    expect(PLUS_QUESTIONS_PER_DAY).toBeGreaterThan(FREE_QUESTIONS_PER_DAY);
    expect(savedChatLimit("plus")).toBe(PLUS_SAVED_CHATS);
    expect(savedChatLimit("free")).toBe(FREE_SAVED_CHATS);
  });

  it("rejects ids that are not a device or a Stripe customer", () => {
    expect(isDeviceId("dev_abc12345")).toBe(true);
    expect(isDeviceId("no")).toBe(false);
    expect(isDeviceId("../etc")).toBe(false);
    expect(isCustomerId("cus_abc123")).toBe(true);
    expect(isCustomerId("sk_live_secret")).toBe(false);
  });

  it("names the missing Stripe env vars and never their values", () => {
    expect(
      stripeConfigGaps({
        STRIPE_SECRET_KEY: "rk_test_example",
        STRIPE_PRICE_PLUS_MONTH: "price_month",
      }),
    ).toEqual(["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PLUS_YEAR"]);
  });
});
