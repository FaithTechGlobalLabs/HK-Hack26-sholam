import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnInput } from "@/lib/agent/harness";

const h = vi.hoisted(() => ({
  inputs: [] as TurnInput[],
  allow: true,
  hang: false,
}));

vi.mock("@/lib/agent/harness", () => ({
  shouldUseLiveAgent: () => ({ live: true }),
  runAgentTurn: async function* (input: TurnInput) {
    h.inputs.push(input);
    if (h.hang) {
      await new Promise((resolve) =>
        input.signal?.addEventListener("abort", resolve),
      );
      return;
    }
    yield { type: "text_delta" as const, text: "ok" };
    yield { type: "done" as const, stopReason: "stop" };
  },
}));
vi.mock("@/lib/agent/usage-store", async () => {
  const { createMemoryCounterStore } = await import("@/lib/agent/usage-limit");
  return { usageStore: () => createMemoryCounterStore() };
});
vi.mock("@/lib/agent/usage-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent/usage-limit")>();
  return {
    ...real,
    admitTurn: async () =>
      h.allow
        ? { ok: true }
        : { ok: false, message: real.VISITOR_HOUR_MESSAGE, retryAfterSec: 120 },
  };
});
vi.mock("@/lib/flashcards/repo", () => ({
  listFlashcards: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => null,
  currentUserId: async () => null,
}));

const { POST } = await import("@/app/api/chat/route");
const { LIMITS } = await import("@/lib/agent/limits");

const post = (body: unknown, signal?: AbortSignal) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.7",
      },
      body: JSON.stringify(body),
      signal,
    }),
  );

beforeEach(() => {
  h.inputs.length = 0;
  h.allow = true;
  h.hang = false;
});

describe("POST /api/chat", () => {
  it("trims a long chat instead of rejecting it", async () => {
    const history = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `turn ${i} ${"x".repeat(3000)}`,
    }));
    const res = await post({ message: "And then?", history });
    expect(res.status).toBe(200);
    await res.text();
    const sent = h.inputs[0].history ?? [];
    expect(sent.length).toBeLessThanOrEqual(LIMITS.client.historyTurns);
    expect(sent.at(-1)?.content.startsWith("turn 59")).toBe(true);
    expect(Math.max(...sent.map((t) => t.content.length))).toBeLessThanOrEqual(
      LIMITS.model.historyTurnChars,
    );
  });

  it("still rejects an absurd payload", async () => {
    const history = Array.from(
      { length: LIMITS.request.maxHistoryItems + 1 },
      () => ({
        role: "user",
        content: "x",
      }),
    );
    expect((await post({ message: "hi", history })).status).toBe(400);
  });

  it("answers 429 with a friendly message when the visitor is over the limit", async () => {
    h.allow = false;
    const res = await post({ message: "hi" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect((await res.json()).error).toMatch(/last hour/);
    expect(h.inputs).toHaveLength(0);
  });

  it("aborts the turn when the client goes away", async () => {
    h.hang = true;
    const client = new AbortController();
    const res = await post({ message: "hi" }, client.signal);
    const reader = res.body?.getReader();
    const pending = reader?.read();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.inputs[0].signal?.aborted).toBe(false);
    await reader?.cancel();
    expect(h.inputs[0].signal?.aborted).toBe(true);
    await pending?.catch(() => undefined);
  });
});
