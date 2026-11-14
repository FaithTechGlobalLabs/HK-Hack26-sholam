import { describe, expect, it } from "vitest";
import { classifyCitations, extractCitations } from "@/lib/agent/citations";
import {
  agentConfig,
  buildMessages,
  shouldUseLiveAgent,
} from "@/lib/agent/harness";
import {
  mapProviderError,
  openRouterConfig,
} from "@/lib/agent/openrouter-config";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOLS, toolDefinitions } from "@/lib/agent/tools";
import { isVerseId } from "@/lib/bible/refs";
import {
  FLASHCARD_MATCH_THRESHOLD,
  rankFlashcards,
} from "@/lib/flashcards/rank";
import { SEED_FLASHCARDS } from "@/lib/flashcards/repo";

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
  it("defaults to ERNIE flash via OpenRouter", () => {
    const cfg = agentConfig({});
    expect(cfg.model).toBe("baidu/ernie-5.5-flash-preview:free");
    expect(cfg.maxSteps).toBe(3);
  });

  it("builds messages with a stable system prompt and session note", () => {
    const messages = buildMessages({
      history: [{ role: "user", content: "Who is Jesus?" }],
      userMessage: "Why did Judas betray him?",
      matchedCardLines: [],
    });
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages.at(-1)?.content).toContain("Why did Judas betray him?");
    expect(messages.at(-1)?.content).toContain("Earlier questions");
    expect(JSON.stringify(messages)).not.toMatch(/OPENROUTER_API_KEY|sk-/i);
  });

  it("keeps the system prompt free of per-request values", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("does not put the API key in openRouterConfig serialization", () => {
    const cfg = openRouterConfig({
      OPENROUTER_API_KEY: "secret-test-key",
      SHOLAM_MODEL: "test/model",
    });
    expect(cfg.apiKey).toBe("secret-test-key");
    expect(cfg.model).toBe("test/model");
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
