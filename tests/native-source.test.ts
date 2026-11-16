import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type AgentEvent, encodeEvent } from "@/lib/agent/events";
import discover from "../data/faithmap.cards.json";
import facts from "../data/flashcards.seed.json";

const nativeFile = (path: string) =>
  readFileSync(
    fileURLToPath(new URL(`../ios/${path}`, import.meta.url)),
    "utf8",
  );

describe("native source and resource contract (not a Swift compilation test)", () => {
  it("bundles the canonical deck without editing the team's teaching text", () => {
    const { cards } = JSON.parse(nativeFile("App/Resources/BundledDeck.json"));
    expect(cards).toEqual([
      ...facts.map((c) => ({ ...c, kind: "fact" })),
      ...discover,
    ]);
    expect(new Set(cards.map((c: { id: string }) => c.id)).size).toBe(
      cards.length,
    );
  });

  it("keeps native auth activation and billing off by default", () => {
    const config = nativeFile("Config/App.xcconfig");
    const project = nativeFile("project.yml");
    expect(config).toMatch(/^SHOLAM_BILLING_ENABLED\s*=\s*NO$/m);
    expect(config).toMatch(/^SHOLAM_PRODUCT_IDS\s*=\s*$/m);
    expect(config).toMatch(/^SHOLAM_NATIVE_SIGN_IN_MODE\s*=\s*disabled$/m);
    expect(project).toContain("ShalomBillingEnabled: false");
    expect(project).toContain("CODE_SIGNING_ALLOWED: NO");
    expect(project).toContain("exactVersion: 2.55.6");
  });

  it("permits explicit Release signing without changing unsigned defaults", () => {
    const project = nativeFile("project.yml");
    expect(project).toContain("CODE_SIGNING_ALLOWED: NO");
    expect(project).toMatch(
      /configs:\s+Release:\s+CODE_SIGNING_ALLOWED: YES\s+CODE_SIGN_STYLE: Manual/,
    );
    expect(project).toContain("DEVELOPMENT_TEAM: 3LHSL95J9H");
    expect(project).toContain(
      "PROVISIONING_PROFILE_SPECIFIER: Shalom AppStore",
    );
  });

  it("bundles licence notices for every resolved Swift dependency", () => {
    const resolved = nativeFile(
      "Shalom.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
    );
    const notices = nativeFile("App/Resources/ThirdPartyNotices.txt");
    const sources = JSON.parse(
      nativeFile("App/Resources/ThirdPartyNotices.sources.json"),
    );
    expect(createHash("sha256").update(resolved).digest("hex")).toBe(
      sources.resolvedSHA256,
    );
    expect(createHash("sha256").update(notices).digest("hex")).toBe(
      sources.documentSHA256,
    );
    for (const pin of JSON.parse(resolved).pins) {
      expect(sources.packages).toContainEqual(
        expect.objectContaining({
          identity: pin.identity,
          revision: pin.state.revision,
        }),
      );
      expect(notices).toContain(`${pin.identity} ${pin.state.version}`);
    }
  });

  it("records the exempt-encryption declaration in the generated app plist", () => {
    expect(nativeFile("project.yml")).toContain(
      "ITSAppUsesNonExemptEncryption: false",
    );
    expect(nativeFile("App/Info.plist")).toMatch(
      /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
    );
  });

  it("the native decoder includes every current SSE event name", () => {
    const source = nativeFile(
      "Packages/ShalomCore/Sources/ShalomCore/SSE/AgentEvent.swift",
    );
    const events: AgentEvent[] = [
      { type: "text_delta", text: "Peace" },
      { type: "tool_start", id: "tool-1", name: "lookup_verses", input: {} },
      {
        type: "tool_result",
        id: "tool-1",
        name: "lookup_verses",
        ok: true,
        summary: "1 verse",
      },
      { type: "verses", verses: [] },
      { type: "flashcards", cards: [] },
      {
        type: "flashcard_proposal",
        draft: {
          question: "What is the shortest verse?",
          answer: "Jesus wept.",
          refs: ["JHN.11.35"],
          category: "jesus",
          tone: "fact",
          difficulty: 1,
        },
      },
      { type: "reset", reason: "verse_check" },
      { type: "citations", unverified: [], quoteWarnings: [] },
      { type: "done", stopReason: "stop" },
      { type: "error", message: "Stopped" },
    ];
    for (const event of events) {
      expect(source).toContain(`"${event.type}"`);
      const frame = encodeEvent(event);
      expect(frame.startsWith(`event: ${event.type}\ndata: `)).toBe(true);
      const payload = JSON.parse(frame.split("data: ")[1]);
      expect(payload).not.toHaveProperty("type");
    }
  });
});
