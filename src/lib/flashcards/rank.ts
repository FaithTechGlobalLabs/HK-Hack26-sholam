import { tokenize } from "@/lib/bible/bsb-tokenize";
import type { Flashcard, FlashcardSummary } from "./types";

/** Minimum score before we treat a card as a real match (not random). */
export const FLASHCARD_MATCH_THRESHOLD = 3;

/** Too common to count as a match on their own. */
const WEAK = new Set([
  "jesus",
  "god",
  "christ",
  "lord",
  "faith",
  "christian",
  "christians",
  "people",
  "person",
  "many",
  "much",
  "like",
  "just",
  "dont",
  "doesnt",
  "allow",
  "problem",
  "problems",
  "deserve",
  "deserved",
  "newborn",
  "newborns",
  "someone",
  "everyone",
  "something",
  "anything",
  "really",
  "happen",
  "happened",
]);

export interface RankedFlashcard {
  card: Flashcard;
  score: number;
}

/**
 * Rank published cards by keyword overlap with a query. Returns only cards
 * at or above the threshold, strongest first.
 */
export function rankFlashcards(
  cards: readonly Flashcard[],
  query: string,
  limit = 5,
): RankedFlashcard[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const scored: RankedFlashcard[] = [];
  for (const card of cards) {
    const hay = (
      card.kind === "discover"
        ? `${card.question} ${card.section} ${card.tags.join(" ")}`
        : `${card.question} ${card.answer} ${card.explanation ?? ""}`
    ).toLowerCase();
    let score = 0;
    let strongHits = 0;
    for (const t of tokens) {
      const hit =
        hay.includes(t) ||
        // light stemming so "talk" meets "spoke"/"speaking"
        (t === "talk" && /spoke|speak|speaking|talk/.test(hay)) ||
        (t === "spoke" && /spoke|speak|speaking|talk/.test(hay));
      if (!hit) continue;
      if (WEAK.has(t)) continue;
      strongHits += 1;
      score += t.length >= 5 ? 2 : 1;
      if (card.question.toLowerCase().includes(t)) score += 1;
    }
    if (strongHits === 0 || score < FLASHCARD_MATCH_THRESHOLD) continue;
    scored.push({ card, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score || a.card.question.localeCompare(b.card.question),
  );
  return scored.slice(0, limit);
}

export function toSummary(card: Flashcard): FlashcardSummary {
  return {
    id: card.id,
    kind: card.kind,
    question: card.question,
    ...(card.kind === "fact" ? { answer: card.answer } : {}),
    refs: card.refs,
    category: card.category,
  };
}

export function formatCardForPrompt(card: Flashcard): string {
  if (card.kind === "discover") {
    return `${card.id}: ${card.question} (discover; starting points ${card.refs.join(", ")})`;
  }
  return `${card.id}: ${card.question} → ${card.answer}`;
}
