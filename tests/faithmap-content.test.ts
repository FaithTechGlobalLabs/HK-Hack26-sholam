import { describe, expect, it } from "vitest";
import { isPassageRef } from "@/lib/bible/refs";
import {
  formatCardForPrompt,
  rankFlashcards,
  toSummary,
} from "@/lib/flashcards/rank";
import { SEED_DISCOVER } from "@/lib/flashcards/repo";

const figTree = SEED_DISCOVER.find(
  (c) => c.id === "faithmap-why-did-jesus-curse-a-fig-tree",
);

describe("FaithMap discover cards", () => {
  it("are the 129 questions, each with the team's answer, explanation and takeaway", () => {
    expect(SEED_DISCOVER).toHaveLength(129);
    for (const card of SEED_DISCOVER) {
      expect(card.answer, card.id).toBeTruthy();
      expect(card.explanation, card.id).toBeTruthy();
      expect(card.takeaway, card.id).toBeTruthy();
      expect(card.refs.every(isPassageRef), card.id).toBe(true);
    }
  });

  it("keeps the first write-up of a repeated question", () => {
    expect(figTree?.takeaway).toBe(
      "The tree is a picture of outward religion that produces no real fruit.",
    );
    expect(figTree?.section).toBe("Strange & Surprising Bible Stories");
  });

  it("gives the agent the answer and takeaway", () => {
    if (!figTree) throw new Error("fig tree card missing");
    expect(toSummary(figTree).answer).toBe(figTree.answer);
    expect(formatCardForPrompt(figTree)).toContain(`→ ${figTree.takeaway}`);
  });

  it("matches a discover card on words in its answer", () => {
    // Both words are in the answer, neither in the question.
    const hits = rankFlashcards(SEED_DISCOVER, "fruitlessness warning");
    expect(hits.map((h) => h.card.id)).toContain(figTree?.id);
  });
});
