import { describe, expect, it } from "vitest";
import { toChatMessages } from "@/lib/chat/stored-content";

const base = {
  v: 1,
  source: "openrouter",
  turn: [],
  text: "[John 11:35](verse:JHN.11.35)",
  verses: [
    {
      id: "JHN.11.35",
      label: "John 11:35",
      text: "Jesus wept.",
      translation: "BSB",
    },
  ],
};
const rendered = (content: unknown) =>
  toChatMessages("chat", [{ seq: 1, role: "assistant", content }])[0];

describe("explicit stored citation-check provenance for native clients", () => {
  it("does not infer a final check from legacy verses and an empty issue map", () => {
    const message = rendered(base);
    expect(message.verses["JHN.11.35"]).toBeDefined();
    expect(message.unverified).toEqual({});
    expect(message.checked).toBe(false);
  });

  it("marks a record with an actual final check, preserving its issues", () => {
    const message = rendered({
      ...base,
      citations: {
        unverified: [
          {
            verseId: "JHN.11.35",
            label: "John 11:35",
            reason: "quote_mismatch",
          },
        ],
        quoteWarnings: [],
      },
    });
    expect(message.checked).toBe(true);
    expect(message.unverified["JHN.11.35"]).toBe("quote_mismatch");
  });

  it("does not mark an errored record checked even if it carries a check", () => {
    expect(
      rendered({
        ...base,
        error: "Interrupted",
        citations: { unverified: [], quoteWarnings: [] },
      }).checked,
    ).toBe(false);
  });

  it("keeps imported text and user messages unchecked", () => {
    const messages = toChatMessages("chat", [
      { seq: 0, role: "user", content: { v: 1, text: "Hello" } },
      {
        seq: 1,
        role: "assistant",
        content: {
          v: 1,
          source: "tab-import",
          turn: [],
          text: base.text,
          verses: [],
        },
      },
    ]);
    expect(messages.map((message) => message.checked)).toEqual([false, false]);
  });
});
