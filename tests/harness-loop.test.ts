import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "@/lib/agent/events";
import type { ChatMessage, ToolCall } from "@/lib/agent/openai-types";
import { OpenRouterError, TurnAborted } from "@/lib/agent/openrouter-config";

type Chunk = {
  type: "text" | "tool_calls_done" | "done";
  text?: string;
  toolCalls?: ToolCall[];
  finishReason?: string | null;
};
type Options = {
  messages: ChatMessage[];
  toolChoice?: "auto" | "none";
  signal?: AbortSignal;
};

const h = vi.hoisted(() => ({
  script: [] as ((opts: Options) => AsyncGenerator<Chunk>)[],
  calls: [] as Options[],
  BSB: {
    "ROM.8.28":
      "And we know that God works all things together for the good of those who love Him, who are called according to His purpose.",
    "NUM.22.28":
      "Then the LORD opened the donkey’s mouth, and she said to Balaam, “What have I done to you that you have beaten me these three times?”",
  } as Record<string, string>,
}));

vi.mock("@/lib/agent/openrouter", () => ({
  streamChatCompletion: (opts: Options) => {
    h.calls.push(opts);
    const next = h.script.shift();
    if (!next) throw new Error("no scripted reply left");
    return next(opts);
  },
}));

vi.mock("@/lib/bible/bsb", () => ({
  lookupRanges: vi.fn(
    async (
      ranges: {
        book: string;
        chapter: number;
        verseStart: number;
        verseEnd: number;
      }[],
    ) =>
      ranges.flatMap((r) => {
        const out = [];
        for (let v = r.verseStart; v <= Math.min(r.verseEnd, 60); v++) {
          const id = `${r.book}.${r.chapter}.${v}`;
          if (h.BSB[id])
            out.push({
              id,
              label: id,
              text: h.BSB[id],
              translation: "BSB",
              book: r.book,
              chapter: r.chapter,
              verse: v,
            });
        }
        return out;
      }),
  ),
  searchBibleText: vi.fn(async () => []),
}));

vi.mock("@/lib/flashcards/repo", () => ({
  listFlashcards: vi.fn(async () => []),
}));

const { runAgentTurn, DAILY_CEILING_MESSAGE } = await import(
  "@/lib/agent/harness"
);

const reply = (...chunks: Chunk[]) =>
  async function* () {
    for (const c of chunks) yield c;
  };
const say = (...parts: string[]) =>
  reply(...parts.map((text) => ({ type: "text" as const, text })), {
    type: "done",
    finishReason: "stop",
  });
const call = (name: string, args: unknown, preamble?: string) =>
  reply(
    ...(preamble ? [{ type: "text" as const, text: preamble }] : []),
    {
      type: "tool_calls_done",
      toolCalls: [
        {
          id: `c-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
      finishReason: "tool_calls",
    },
    { type: "done", finishReason: "tool_calls" },
  );

async function collect(
  input: Partial<Parameters<typeof runAgentTurn>[0]> = {},
  onEvent?: (e: AgentEvent) => void,
) {
  const events: AgentEvent[] = [];
  for await (const event of runAgentTurn({
    chatId: "c1",
    userId: null,
    userMessage: "Question",
    history: [],
    ...input,
  })) {
    events.push(event);
    onEvent?.(event);
  }
  return events;
}

const types = (events: AgentEvent[]) => events.map((e) => e.type);
const textOf = (events: AgentEvent[]) => {
  let text = "";
  for (const e of events) {
    if (e.type === "text_delta") text += e.text;
    if (e.type === "reset") text = e.text ?? "";
  }
  return text;
};

const NKJV_ROMANS =
  '"And we know that all things work together for good to those who love God, to those who are the called according to His purpose." (Romans 8:28, BSB)';
const BSB_ROMANS =
  '"And we know that God works all things together for the good of those who love Him" [Romans 8:28](verse:ROM.8.28).';

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  h.script.length = 0;
  h.calls.length = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runAgentTurn", () => {
  it("streams text and finishes with a citation check and done", async () => {
    h.script.push(say("Hello from ", "the fixture."));
    const events = await collect();
    expect(textOf(events)).toBe("Hello from the fixture.");
    expect(types(events).slice(-2)).toEqual(["citations", "done"]);
    expect(h.calls[0].toolChoice).toBe("auto");
  });

  it("verifies a verse a tool returned before the answer", async () => {
    h.script.push(
      call("lookup_verses", { references: ["Romans 8:28"] }),
      say(BSB_ROMANS),
    );
    const events = await collect();
    const firstText = types(events).indexOf("text_delta");
    const verses = types(events).indexOf("verses");
    expect(verses).toBeGreaterThan(-1);
    expect(verses).toBeLessThan(firstText);
    expect(events.at(-2)).toEqual({
      type: "citations",
      unverified: [],
      quoteWarnings: [],
    });
    expect(h.calls).toHaveLength(2);
    const toolMsg = h.calls[1].messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("ROM.8.28 | And we know that God works");
  });

  it("hands the answered turn to onFinish before done (for saving)", async () => {
    h.script.push(
      call("lookup_verses", { references: ["Romans 8:28"] }),
      say(BSB_ROMANS),
    );
    const finished: unknown[] = [];
    let doneSeenBeforeSave = false;
    const events = await collect(
      {
        onFinish: async (turn) => {
          finished.push(turn);
        },
      },
      (e) => {
        if (e.type === "done" && finished.length === 0)
          doneSeenBeforeSave = true;
      },
    );
    expect(doneSeenBeforeSave).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
    expect(finished).toHaveLength(1);
    const turn = finished[0] as {
      text: string;
      messages: { role: string; tool_calls?: unknown }[];
      verses: { id: string }[];
      citations: { unverified: unknown[] };
    };
    expect(turn.text).toBe(BSB_ROMANS);
    expect(turn.messages.map((m) => m.role)).toEqual([
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(turn.messages[0].tool_calls).toBeDefined();
    expect(turn.verses.map((v) => v.id)).toContain("ROM.8.28");
    expect(turn.citations.unverified).toEqual([]);
  });

  it("keeps answering when onFinish fails", async () => {
    h.script.push(say("Hello."));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events = await collect({
      onFinish: async () => {
        throw new Error("db down");
      },
    });
    expect(types(events).slice(-2)).toEqual(["citations", "done"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rewrites once when the answer quotes Scripture from memory", async () => {
    h.script.push(say(NKJV_ROMANS), say(BSB_ROMANS));
    const events = await collect();
    const t = types(events);
    expect(t.indexOf("reset")).toBeGreaterThan(t.indexOf("text_delta"));
    expect(events.find((e) => e.type === "reset")).toMatchObject({
      reason: "verse_check",
    });
    // The verse was fetched before the rewrite, not after it.
    expect(t.indexOf("verses")).toBeLessThan(t.indexOf("reset"));
    expect(t.lastIndexOf("verses")).toBeLessThan(t.lastIndexOf("text_delta"));
    expect(textOf(events)).toBe(BSB_ROMANS);
    expect(events.at(-2)).toEqual({
      type: "citations",
      unverified: [],
      quoteWarnings: [],
    });

    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].toolChoice).toBe("none");
    const note = h.calls[1].messages.at(-1)?.content ?? "";
    expect(note).toContain("Verse check");
    expect(note).toContain("ROM.8.28 | And we know that God works all things");
    expect(h.calls[1].messages.at(-2)).toEqual({
      role: "assistant",
      content: NKJV_ROMANS,
    });
  });

  it("never sends verse text after the answer, and flags it, when no rewrite is possible", async () => {
    h.script.push(
      say(
        'He promised good to those who love Him [Romans 8:28](verse:ROM.8.28): "all things work together for good".',
      ),
    );
    let budget = 1;
    const events = await collect({
      reserveModelCall: async () => budget-- > 0,
    });
    expect(types(events)).not.toContain("verses");
    expect(types(events)).not.toContain("reset");
    expect(events.at(-2)).toEqual({
      type: "citations",
      unverified: [
        { verseId: "ROM.8.28", label: "Romans 8:28", reason: "not_fetched" },
      ],
      quoteWarnings: [],
    });
    expect(h.calls).toHaveLength(1);
  });

  it("restores the draft with flags when the rewrite fails", async () => {
    h.script.push(say(NKJV_ROMANS), async function* () {
      yield { type: "text" as const, text: "And we" };
      throw new OpenRouterError("busy", 429);
    });
    const events = await collect();
    expect(types(events)).not.toContain("error");
    expect(events.filter((e) => e.type === "reset").at(-1)).toMatchObject({
      reason: "restore",
      text: NKJV_ROMANS,
    });
    expect(textOf(events)).toBe(NKJV_ROMANS);
    expect(events.at(-2)).toMatchObject({
      type: "citations",
      quoteWarnings: ["Romans 8:28"],
    });
  });

  it("clears a preamble and runs a tool call the model wrote as text", async () => {
    h.script.push(
      call(
        "lookup_verses",
        { references: ["Numbers 22:28"] },
        "Let me look that up.",
      ),
      say(
        "Yes. The LORD opened the donkey’s mouth [Numbers 22:28](verse:NUM.22.28).",
      ),
    );
    const events = await collect();
    expect(events.find((e) => e.type === "reset")).toEqual({
      type: "reset",
      reason: "tool_call",
    });
    expect(types(events)).toContain("tool_start");
    expect(textOf(events)).toBe(
      "Yes. The LORD opened the donkey’s mouth [Numbers 22:28](verse:NUM.22.28).",
    );
    expect(textOf(events)).not.toContain("<tool_call>");
  });

  it("keeps an answer that ends by drafting a card, without another call", async () => {
    h.script.push(
      call("lookup_verses", { references: ["Numbers 22:28"] }),
      reply(
        { type: "text", text: "Here is a card idea." },
        {
          type: "tool_calls_done",
          toolCalls: [
            {
              id: "p1",
              type: "function",
              function: {
                name: "propose_flashcard",
                arguments: JSON.stringify({
                  question: "Which animal spoke to Balaam?",
                  answer: "His donkey.",
                  refs: ["NUM.22.28"],
                  category: "old-testament",
                  tone: "fun",
                }),
              },
            },
          ],
        },
        { type: "done", finishReason: "tool_calls" },
      ),
    );
    const events = await collect();
    expect(types(events)).toContain("flashcard_proposal");
    expect(types(events)).not.toContain("reset");
    expect(textOf(events)).toBe("Here is a card idea.");
    expect(h.calls).toHaveLength(2);
  });

  it("stops offering tools after the tool-round budget and never exceeds the call cap", async () => {
    for (let i = 0; i < 6; i++)
      h.script.push(call("search_bible", { query: "peace" }));
    const events = await collect();
    expect(h.calls.length).toBeLessThanOrEqual(4);
    expect(h.calls.at(-1)?.toolChoice).toBe("none");
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  it("stops quietly on abort and passes the signal to the model call", async () => {
    const controller = new AbortController();
    h.script.push(async function* (opts: Options) {
      yield { type: "text" as const, text: "Hel" };
      // Like fetch: an already-aborted signal rejects at once.
      await new Promise((_, reject) => {
        if (opts.signal?.aborted) reject(new TurnAborted());
        opts.signal?.addEventListener("abort", () => reject(new TurnAborted()));
      });
    });
    const events = await collect({ signal: controller.signal }, (e) => {
      if (e.type === "text_delta") controller.abort();
    });
    expect(h.calls[0].signal).toBe(controller.signal);
    expect(types(events)).toEqual(["text_delta"]);
  });

  it("explains the daily ceiling without calling the model", async () => {
    const events = await collect({ reserveModelCall: async () => false });
    expect(events).toEqual([{ type: "error", message: DAILY_CEILING_MESSAGE }]);
    expect(h.calls).toHaveLength(0);
  });
});
