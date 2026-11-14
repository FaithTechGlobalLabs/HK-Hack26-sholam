import { describe, expect, it } from "vitest";
import {
  createToolCallTextFilter,
  parseToolCallBlock,
} from "@/lib/agent/tool-call-text";

const NEMOTRON =
  '<tool_call>\n<function=lookup_verses>\n<parameter=references>\n["Numbers 22:21-35"]\n</parameter>\n</function>\n</tool_call>';

function run(chunks: string[]) {
  const filter = createToolCallTextFilter();
  let text = "";
  const shown: string[] = [];
  for (const c of chunks) {
    const visible = filter.push(c);
    shown.push(visible);
    text += visible;
  }
  const tail = filter.flush();
  return {
    text: text + tail.text,
    calls: tail.calls,
    malformed: tail.malformed,
    shown,
  };
}

describe("text-format tool calls", () => {
  it("turns Nemotron's XML block into a real call and shows none of it", () => {
    const { text, calls } = run([NEMOTRON]);
    expect(text).toBe("");
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe("lookup_verses");
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      references: ["Numbers 22:21-35"],
    });
  });

  it("never leaks a partial tag, whatever the chunk split", () => {
    const wire = `Let me check.\n${NEMOTRON}`;
    for (let size = 1; size <= 12; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < wire.length; i += size)
        chunks.push(wire.slice(i, i + size));
      const { text, calls, shown } = run(chunks);
      expect(text).toBe("Let me check.\n");
      expect(shown.join("")).not.toMatch(/<|tool_call|function=/);
      expect(calls.map((c) => c.function.name)).toEqual(["lookup_verses"]);
    }
  });

  it("reads the Hermes JSON form and several calls", () => {
    const { calls } = run([
      '<tool_call>{"name": "search_bible", "arguments": {"query": "talking donkey", "limit": 3}}</tool_call>',
      '<tool_call><function=lookup_verses><parameter=references>["Numbers 22:28"]</parameter></function></tool_call>',
    ]);
    expect(calls.map((c) => c.function.name)).toEqual([
      "search_bible",
      "lookup_verses",
    ]);
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      query: "talking donkey",
      limit: 3,
    });
    expect(calls[0].id).not.toBe(calls[1].id);
  });

  it("coerces numbers and keeps plain strings", () => {
    const parsed = parseToolCallBlock(
      "<function=search_flashcards><parameter=query>\nMethuselah age\n</parameter><parameter=limit>3</parameter></function>",
    );
    expect(parsed).toEqual({
      name: "search_flashcards",
      arguments: JSON.stringify({ query: "Methuselah age", limit: 3 }),
    });
  });

  it("keeps ordinary angle brackets and drops stray closing tags", () => {
    expect(run(["2 < 3 and 4 > 1"]).text).toBe("2 < 3 and 4 > 1");
    expect(run(["Done.</tool_call>"]).text).toBe("Done.");
    expect(run(["a <", "b"]).text).toBe("a <b");
  });

  it("parses a block cut off by max_tokens when it is still readable", () => {
    const cut = run([
      "<tool_call><function=propose_flashcard><parameter=question>How old was Methuselah?</parameter>",
    ]);
    expect(cut.calls[0]?.function.name).toBe("propose_flashcard");
    const garbled = run(["<tool_call>{not json"]);
    expect(garbled.calls).toHaveLength(0);
    expect(garbled.malformed).toBe(true);
    expect(garbled.text).toBe("");
  });
});
