import { describe, expect, it } from "vitest";
import { isFreeModel, planRateLimit } from "@/lib/agent/rate-limit";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("free model detection", () => {
  it("treats :free ids as capped and paid ids as not", () => {
    expect(isFreeModel("baidu/ernie-5.5-flash-preview:free")).toBe(true);
    expect(isFreeModel("openai/gpt-4.1-mini")).toBe(false);
  });
});

describe("planRateLimit", () => {
  const now = 1_700_000_000_000;

  it("retries a short per-minute window", () => {
    const plan = planRateLimit(
      headers({ "retry-after": "2", "x-ratelimit-remaining": "0" }),
      0,
      now,
    );
    expect(plan.action).toBe("retry");
    expect(plan.waitMs).toBe(2000);
  });

  it("does not retry a daily cap", () => {
    const plan = planRateLimit(
      headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(now + 6 * 60 * 60 * 1000),
      }),
      0,
      now,
    );
    expect(plan.action).toBe("fail");
    expect(plan.message).toMatch(/midnight UTC/);
    expect(plan.message).not.toMatch(/sk-|api[_ ]?key/i);
  });

  it("stops after two retries", () => {
    const plan = planRateLimit(headers({}), 2, now);
    expect(plan.action).toBe("fail");
  });
});
