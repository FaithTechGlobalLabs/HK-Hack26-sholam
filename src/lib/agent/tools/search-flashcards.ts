import { z } from "zod";
import { clip } from "@/lib/agent/context";
import { LIMITS } from "@/lib/agent/limits";
import { rankFlashcards, toSummary } from "@/lib/flashcards/rank";
import { listFlashcards } from "@/lib/flashcards/repo";
import { CATEGORIES, KINDS } from "@/lib/flashcards/types";
import { defineTool } from "./types";

export const searchFlashcards = defineTool({
  name: "search_flashcards",
  description:
    "Search sholam's public Bible card deck by keywords. The deck has two kinds: fact cards (a question with an answer and verse ids) and discover cards (an open question with Scripture starting points and no fixed answer). The session note already lists the closest cards for the user's question, so call this only to look for a different topic, or before proposing a new card, to avoid duplicates. Returns matching cards with ids, kind, question, answer (fact cards) and passage refs. Returns nothing when no card is a strong match.",
  inputSchema: z.strictObject({
    query: z
      .string()
      .min(2)
      .describe("Keywords, e.g. 'shortest verse' or 'Zacchaeus tree'"),
    kind: z
      .enum(KINDS)
      .optional()
      .describe("Only fact cards or only discover cards"),
    category: z
      .enum(CATEGORIES)
      .optional()
      .describe("Only search one category"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(LIMITS.tools.cardHits)
      .default(LIMITS.tools.cardHits),
  }),
  async run(input, ctx) {
    const cards = await listFlashcards({
      kind: input.kind,
      category: input.category,
      limit: 200,
    });
    const ranked = rankFlashcards(cards, input.query, input.limit);
    if (!ranked.length)
      return `No strong flashcard match for "${input.query}".`;

    const summaries = ranked.map((r) => toSummary(r.card));
    ctx.emit({ type: "flashcards", cards: summaries });

    return summaries
      .map((c) => {
        const answer = c.answer ? ` | A: ${clip(c.answer, 200)}` : "";
        return `${c.id} | ${c.kind} | Q: ${clip(c.question, 200)}${answer} | refs: ${c.refs.slice(0, 4).join(", ")} | /flashcards?card=${c.id}`;
      })
      .join("\n");
  },
});
