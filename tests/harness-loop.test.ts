import { describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/lib/agent/events";

vi.mock("@/lib/agent/openrouter", () => ({
  streamChatCompletion: async function* () {
    yield { type: "text" as const, text: "Hello from " };
    yield { type: "text" as const, text: "the fixture." };
    yield { type: "done" as const, finishReason: "stop" };
  },
}));

describe("runAgentTurn fixture", () => {
  it("streams text and finishes with done", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const { runAgentTurn } = await import("@/lib/agent/harness");
    const events: AgentEvent[] = [];
    for await (const event of runAgentTurn({
      chatId: "c1",
      userId: null,
      userMessage: "Hi",
      history: [],
    })) {
      events.push(event);
    }
    expect(
      events
        .filter((e) => e.type === "text_delta")
        .map((e) => (e as { text: string }).text)
        .join(""),
    ).toBe("Hello from the fixture.");
    expect(events.at(-1)).toMatchObject({ type: "done" });
    vi.unstubAllEnvs();
  });
});
