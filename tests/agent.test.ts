import { describe, expect, it } from "vitest";
import { classifyCitations, extractCitations } from "@/lib/agent/citations";
import { agentConfig, buildRequest } from "@/lib/agent/harness";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOLS, toolDefinitions } from "@/lib/agent/tools";
import { isPassageRef, isVerseId } from "@/lib/bible/refs";
import { SEED_DISCOVER, SEED_FLASHCARDS } from "@/lib/flashcards/repo";
import { DISCOVER_CATEGORIES } from "@/lib/flashcards/types";

describe("citations", () => {
  const md =
    "See [John 3:16](verse:JHN.3.16) and [1 Cor 13:4-7](verse:1CO.13.4), not [x](https://example.com).";

  it("extracts verse links only", () => {
    expect(extractCitations(md)).toEqual([
      { label: "John 3:16", verseId: "JHN.3.16" },
      { label: "1 Cor 13:4-7", verseId: "1CO.13.4" },
    ]);
  });

  it("splits verified from unverified by verses seen this turn", () => {
    const { verified, unverified } = classifyCitations(
      extractCitations(md),
      new Set(["JHN.3.16"]),
    );
    expect(verified.map((c) => c.verseId)).toEqual(["JHN.3.16"]);
    expect(unverified.map((c) => c.verseId)).toEqual(["1CO.13.4"]);
  });
});

describe("tools", () => {
  it("have unique names and object input schemas", () => {
    const defs = toolDefinitions();
    expect(new Set(defs.map((d) => d.name)).size).toBe(TOOLS.length);
    for (const def of defs) {
      expect(def.input_schema.type).toBe("object");
      expect(def.input_schema).not.toHaveProperty("$schema");
      expect(def.description?.length ?? 0).toBeGreaterThan(40);
    }
  });

  it("are byte-stable across calls (prompt caching)", () => {
    expect(JSON.stringify(toolDefinitions())).toBe(
      JSON.stringify(toolDefinitions()),
    );
  });
});

describe("request", () => {
  it("defaults to Opus 5.5 at medium effort and caches the system prompt", () => {
    const req = buildRequest(
      [{ role: "user", content: "hi" }],
      agentConfig({}),
    );
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config?.effort).toBe("medium");
    expect(req.system).toEqual([
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("ignores an invalid effort", () => {
    expect(agentConfig({ SHOLAM_EFFORT: "turbo" }).effort).toBe("medium");
  });

  it("keeps the system prompt free of per-request values", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("seed flashcards", () => {
  it("are valid, uniquely keyed and cite real verse ids", () => {
    expect(SEED_FLASHCARDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SEED_FLASHCARDS.map((c) => c.id)).size).toBe(
      SEED_FLASHCARDS.length,
    );
    for (const card of SEED_FLASHCARDS)
      for (const ref of card.refs) expect(isVerseId(ref), ref).toBe(true);
  });
});

describe("discover cards (FaithMap)", () => {
  it("has 129 unique open questions with passage refs and no answers", () => {
    expect(SEED_DISCOVER).toHaveLength(129);
    expect(new Set(SEED_DISCOVER.map((c) => c.id)).size).toBe(129);
    expect(new Set(SEED_DISCOVER.map((c) => c.question)).size).toBe(129);
    for (const card of SEED_DISCOVER) {
      expect(card.kind).toBe("discover");
      expect(card).not.toHaveProperty("answer");
      expect(DISCOVER_CATEGORIES).toContain(card.category);
      expect(card.refs.length).toBeGreaterThan(0);
      for (const ref of card.refs)
        expect(isPassageRef(ref), `${card.id}: ${ref}`).toBe(true);
    }
  });

  it("keeps the source's level, tags and time where given", () => {
    const card = SEED_DISCOVER.find((c) =>
      c.question.startsWith("Can you forgive someone and still not trust them"),
    );
    expect(card).toMatchObject({
      difficulty: 3,
      tags: ["Real Life", "Deep"],
      minutes: 3,
      refs: ["MAT.18.21-MAT.18.35", "LUK.17.3-LUK.17.4"],
      section: "Everyday Life, Social Media & Identity",
    });
  });
});
