import { describe, expect, it } from "vitest";
import { demoTurn } from "@/lib/agent/demo";
import {
  type AgentEvent,
  encodeEvent,
  eventStream,
  SseDecoder,
} from "@/lib/agent/events";

const sample: AgentEvent[] = [
  {
    type: "tool_start",
    id: "t1",
    name: "lookup_verses",
    input: { references: ["John 11:35"] },
  },
  {
    type: "verses",
    verses: [
      {
        id: "JHN.11.35",
        label: "John 11:35",
        text: "Jesus wept.",
        translation: "BSB",
      },
    ],
  },
  { type: "text_delta", text: "Line one\n\nline two with: colons" },
  { type: "done", stopReason: "end_turn" },
];

describe("SSE encoding", () => {
  it("round-trips events", () => {
    const decoder = new SseDecoder();
    expect(decoder.push(sample.map(encodeEvent).join(""))).toEqual(sample);
  });

  it("handles frames split at any byte", () => {
    const wire = sample.map(encodeEvent).join("");
    for (const size of [1, 3, 7, 50]) {
      const decoder = new SseDecoder();
      const out: AgentEvent[] = [];
      for (let i = 0; i < wire.length; i += size)
        out.push(...decoder.push(wire.slice(i, i + size)));
      expect(out).toEqual(sample);
    }
  });

  it("skips unknown types and malformed JSON", () => {
    const decoder = new SseDecoder();
    const wire = `event: ping\ndata: {}\n\nevent: text_delta\ndata: {nope\n\n${encodeEvent(sample[3])}`;
    expect(decoder.push(wire)).toEqual([sample[3]]);
  });

  it("streams an async source and reports thrown errors as an error event", async () => {
    async function* source(): AsyncGenerator<AgentEvent> {
      yield sample[2];
      throw new Error("boom");
    }
    const text = await new Response(eventStream(source())).text();
    expect(new SseDecoder().push(text)).toEqual([
      sample[2],
      { type: "error", message: "boom" },
    ]);
  });
});

describe("demo turn", () => {
  it("emits verses before text and ends with done", async () => {
    const types: string[] = [];
    for await (const e of demoTurn("make a card")) types.push(e.type);
    expect(types.indexOf("verses")).toBeLessThan(types.indexOf("text_delta"));
    expect(types).toContain("flashcard_proposal");
    expect(types.at(-1)).toBe("done");
  });
});

describe("eventStream cancel", () => {
  it("pulls lazily, and on cancel aborts first and then stops the source", async () => {
    const order: string[] = [];
    let produced = 0;
    async function* source(): AsyncGenerator<AgentEvent> {
      try {
        for (;;) {
          produced++;
          yield { type: "text_delta", text: "x" };
        }
      } finally {
        order.push("source-stopped");
      }
    }
    const stream = eventStream(source(), {
      onCancel: () => order.push("aborted"),
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.read();
    expect(produced).toBeLessThanOrEqual(3);
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["aborted", "source-stopped"]);
  });

  it("decodes reset and citations events", () => {
    const events: AgentEvent[] = [
      { type: "reset", reason: "verse_check" },
      {
        type: "citations",
        unverified: [
          { verseId: "JHN.3.16", label: "John 3:16", reason: "not_fetched" },
        ],
        quoteWarnings: ["Romans 8:28"],
      },
    ];
    expect(new SseDecoder().push(events.map(encodeEvent).join(""))).toEqual(
      events,
    );
  });
});
