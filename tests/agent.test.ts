import { describe, expect, it } from "vitest";
import { classifyCitations, extractCitations } from "@/lib/agent/citations";
import {
  agentConfig,
  buildMessages,
  shouldUseLiveAgent,
} from "@/lib/agent/harness";
import { LIMITS } from "@/lib/agent/limits";
import {
  mapProviderError,
  openRouterConfig,
} from "@/lib/agent/openrouter-config";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOLS, toolDefinitions } from "@/lib/agent/tools";
import { isPassageRef, isVerseId } from "@/lib/bible/refs";
import {
  FLASHCARD_MATCH_THRESHOLD,
  rankFlashcards,
} from "@/lib/flashcards/rank";
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
    expect(new Set(defs.map((d) => d.function.name)).size).toBe(TOOLS.length);
    for (const def of defs) {
      expect(def.type).toBe("function");
      expect(def.function.parameters.type).toBe("object");
      expect(def.function.parameters).not.toHaveProperty("$schema");
      expect(def.function.description.length).toBeGreaterThan(40);
    }
  });

  it("are byte-stable across calls (prompt caching)", () => {
    expect(JSON.stringify(toolDefinitions())).toBe(
      JSON.stringify(toolDefinitions()),
    );
  });
});

describe("request", () => {
  it("defaults to the free Nemotron model via OpenRouter", () => {
    const cfg = agentConfig({});
    expect(cfg.model).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(cfg.maxSteps).toBe(LIMITS.turn.maxModelCalls);
    expect(cfg.maxTokens).toBe(LIMITS.model.maxTokens);
  });

  it("builds messages with a stable system prompt and session note", () => {
    const messages = buildMessages({
      history: [{ role: "user", content: "Who is Jesus?" }],
      userMessage: "Why did Judas betray him?",
      matchedCardLines: [],
    });
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages.at(-1)?.content).toContain("Why did Judas betray him?");
    expect(messages.at(-1)?.content).toContain("Already discussed");
    expect(JSON.stringify(messages)).not.toMatch(/OPENROUTER_API_KEY|sk-/i);
  });

  it("keeps the system prompt free of per-request values", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("tells the model to fetch before quoting, not to skip tools", () => {
    expect(SYSTEM_PROMPT).not.toContain("Do not call a tool before answering");
    expect(SYSTEM_PROMPT).toContain("Never quote Scripture from memory");
  });

  it("does not put the API key in openRouterConfig serialization", () => {
    const cfg = openRouterConfig({
      OPENROUTER_API_KEY: "secret-test-key",
      SHOLAM_MODEL: "test/model:free",
    });
    expect(cfg.apiKey).toBe("secret-test-key");
    expect(cfg.model).toBe("test/model:free");
  });

  it("only runs free models: a paid or empty SHOLAM_MODEL falls back", () => {
    const fallback = "nvidia/nemotron-3-ultra-550b-a55b:free";
    expect(openRouterConfig({ SHOLAM_MODEL: "claude-opus-5-5" }).model).toBe(
      fallback,
    );
    expect(
      openRouterConfig({ SHOLAM_MODEL: "nvidia/nemotron-3-ultra-550b-a55b" })
        .model,
    ).toBe(fallback);
    expect(openRouterConfig({ SHOLAM_MODEL: "  " }).model).toBe(fallback);
    expect(
      openRouterConfig({ SHOLAM_MODEL: " google/gemma-4-31b-it:free " }).model,
    ).toBe("google/gemma-4-31b-it:free");
  });
});

describe("live mode", () => {
  it("uses demo without a key", () => {
    expect(shouldUseLiveAgent({}).live).toBe(false);
  });

  it("goes live when a key is present", () => {
    expect(shouldUseLiveAgent({ OPENROUTER_API_KEY: "x" }).live).toBe(true);
  });

  it("forces demo when SHOLAM_AGENT=demo", () => {
    expect(
      shouldUseLiveAgent({
        OPENROUTER_API_KEY: "x",
        SHOLAM_AGENT: "demo",
      }).live,
    ).toBe(false);
  });

  it("reports a config error when live is forced without a key", () => {
    const mode = shouldUseLiveAgent({ SHOLAM_AGENT: "live" });
    expect(mode.live).toBe(true);
    expect(mode.reason).toMatch(/OPENROUTER_API_KEY/);
  });
});

describe("provider errors", () => {
  it("maps auth and rate-limit failures without leaking bodies", () => {
    expect(mapProviderError(401).message).toMatch(/API key/i);
    expect(mapProviderError(429).message).toMatch(/rate-limited/i);
    expect(mapProviderError(401, "secret-token-xyz").message).not.toContain(
      "secret-token",
    );
  });
});

describe("flashcard ranking", () => {
  it("matches the donkey card and rejects weak queries", () => {
    const hit = rankFlashcards(
      SEED_FLASHCARDS,
      "Did a donkey really talk in the Bible?",
    );
    expect(hit[0]?.card.id).toBe("seed-balaam-donkey");
    expect(hit[0]?.score).toBeGreaterThanOrEqual(FLASHCARD_MATCH_THRESHOLD);

    const miss = rankFlashcards(
      SEED_FLASHCARDS,
      "Why does God allow suffering?",
    );
    expect(miss).toHaveLength(0);

    expect(rankFlashcards(SEED_FLASHCARDS, "Who is Jesus?")).toHaveLength(0);
    expect(
      rankFlashcards(
        SEED_FLASHCARDS,
        "why does God allow so many problems to people who dont deserve it? like newborns",
      ),
    ).toHaveLength(0);
  });
});

describe("seed flashcards", () => {
  it("are valid, uniquely keyed and cite real verse ids", () => {
    expect(SEED_FLASHCARDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SEED_FLASHCARDS.map((c) => c.id)).size).toBe(
      SEED_FLASHCARDS.length,
    );
    for (const card of SEED_FLASHCARDS)
      for (const ref of card.refs) expect(isVerseId(ref)).toBe(true);
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
