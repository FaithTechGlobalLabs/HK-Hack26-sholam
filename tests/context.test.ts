import { describe, expect, it } from "vitest";
import {
  assemblePrompt,
  buildPromptParts,
  clipToolResult,
  promptChars,
  trimHistory,
} from "@/lib/agent/context";
import { dailyModelCallCeiling, LIMITS } from "@/lib/agent/limits";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

const turns = (n: number, size = 50) =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `${i}:${"x".repeat(size)}`,
  }));

describe("trimHistory", () => {
  it("keeps the newest turns within the count and character budgets", () => {
    const out = trimHistory(turns(60), {
      turns: 8,
      turnChars: 1000,
      totalChars: 100_000,
    });
    expect(out).toHaveLength(8);
    expect(out[0].content.startsWith("52:")).toBe(true);
    expect(out.at(-1)?.content.startsWith("59:")).toBe(true);

    const small = trimHistory(turns(60, 100), {
      turns: 50,
      turnChars: 1000,
      totalChars: 350,
    });
    expect(small.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(
      350,
    );
  });

  it("clips long turns and starts on a user turn", () => {
    const out = trimHistory(
      [
        { role: "assistant", content: "orphan" },
        { role: "user", content: "q".repeat(5000) },
        { role: "assistant", content: "a" },
      ],
      { turns: 10, turnChars: 100, totalChars: 10_000 },
    );
    expect(out[0].role).toBe("user");
    expect(out[0].content).toHaveLength(100);
    expect(out[0].content.endsWith("…")).toBe(true);
  });
});

describe("buildPromptParts", () => {
  it("caps history, earlier questions and matched cards from LIMITS", () => {
    const parts = buildPromptParts({
      history: turns(60, 2000),
      userMessage: "Why did Judas betray Jesus?",
      matchedCardLines: Array.from(
        { length: 10 },
        (_, i) => `card-${i}: ${"q".repeat(900)}`,
      ),
    });
    expect(parts.history.length).toBeLessThanOrEqual(LIMITS.model.historyTurns);
    expect(promptChars(parts.history)).toBeLessThanOrEqual(
      LIMITS.model.historyChars,
    );
    const note = parts.current.content ?? "";
    expect(note).toContain("Why did Judas betray Jesus?");
    expect(note).toContain("card-2");
    expect(note).not.toContain("card-3");
    expect(note.length).toBeLessThan(
      LIMITS.model.matchedCards * LIMITS.model.matchedCardChars + 2000,
    );
  });
});

describe("assemblePrompt", () => {
  it("never touches the system prompt (prompt caching)", () => {
    const messages = assemblePrompt(
      buildPromptParts({ history: turns(4), userMessage: "Hi" }),
    );
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
  });

  it("drops the oldest history, then clips tool results, to fit the budget", () => {
    const parts = buildPromptParts({
      history: turns(8, 1000),
      userMessage: "Q",
    });
    parts.tail.push(
      { role: "assistant", content: null, tool_calls: [] },
      { role: "tool", tool_call_id: "t1", content: "v".repeat(20_000) },
    );
    const budget = SYSTEM_PROMPT.length + 9_000;
    const messages = assemblePrompt(parts, budget);
    expect(promptChars(messages)).toBeLessThanOrEqual(budget);
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    expect(messages.filter((m) => m.role === "user").at(-1)?.content).toContain(
      "Q",
    );
    const history = messages.slice(1, messages.indexOf(parts.current));
    expect(history.length).toBeLessThan(parts.history.length);
    expect(history[0]?.role ?? "user").toBe("user");
    // The original parts are not modified.
    expect(parts.tail[1].content).toHaveLength(20_000);
  });

  it("keeps the default request under the prompt budget", () => {
    const parts = buildPromptParts({
      history: turns(40, 5000),
      userMessage: "q".repeat(LIMITS.request.maxMessageChars),
      matchedCardLines: ["c".repeat(5000), "d".repeat(5000), "e".repeat(5000)],
    });
    for (let i = 0; i < 4; i++)
      parts.tail.push({
        role: "tool",
        tool_call_id: `t${i}`,
        content: clipToolResult("v".repeat(50_000)),
      });
    expect(promptChars(assemblePrompt(parts))).toBeLessThanOrEqual(
      LIMITS.model.promptChars,
    );
  });
});

describe("limits", () => {
  it("clips tool results to the configured size", () => {
    expect(clipToolResult("x".repeat(100_000)).length).toBeLessThanOrEqual(
      LIMITS.tools.resultChars,
    );
    expect(clipToolResult("short")).toBe("short");
  });

  it("keeps our daily ceiling under OpenRouter's free cap, overridable by env", () => {
    expect(dailyModelCallCeiling({})).toBeLessThan(1000);
    expect(dailyModelCallCeiling({ SHOLAM_DAILY_MODEL_CALLS: "40" })).toBe(40);
    expect(dailyModelCallCeiling({ SHOLAM_DAILY_MODEL_CALLS: "-1" })).toBe(
      LIMITS.usage.globalModelCallsPerDay,
    );
    expect(LIMITS.turn.maxModelCalls).toBeGreaterThan(
      LIMITS.turn.maxToolRounds,
    );
  });
});
