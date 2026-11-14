import { describe, expect, it } from "vitest";
import { createReasoningFilter } from "@/lib/agent/reasoning-filter";

describe("reasoning filter", () => {
  it("drops a think block and keeps the answer", () => {
    const filter = createReasoningFilter();
    const out =
      filter("<think>weigh the question") +
      filter("</think>\n\nChristianity teaches that suffering");
    expect(out).toBe("Christianity teaches that suffering");
  });

  it("holds a tag split across chunks", () => {
    const filter = createReasoningFilter();
    expect(filter("Hi <thi")).toBe("Hi ");
    expect(filter("nk>secret</think> there")).toBe(" there");
  });

  it("keeps ordinary text", () => {
    const filter = createReasoningFilter();
    expect(filter("God allows suffering")).toBe("God allows suffering");
  });
});
