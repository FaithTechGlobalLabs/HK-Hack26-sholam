import { z } from "zod";
import { rankFlashcards, toSummary } from "@/lib/flashcards/rank";
import { listFlashcards } from "@/lib/flashcards/repo";
import { CATEGORIES } from "@/lib/flashcards/types";
import { defineTool } from "./types";

export const searchFlashcards = defineTool({
  name: "search_flashcards",
  description:
    "Search Shalom's public Bible flashcard deck by keywords. Use it before answering trivia or fact questions, and before proposing a new card, to avoid duplicates. Returns matching cards with their ids, questions, answers and verse refs. Returns nothing when no card is a strong match.",
  inputSchema: z.strictObject({
    query: z
      .string()
      .min(2)
      .describe("Keywords, e.g. 'shortest verse' or 'Zacchaeus tree'"),
    category: z
      .enum(CATEGORIES)
      .optional()
      .describe("Only search one category"),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  async run(input, ctx) {
    const cards = await listFlashcards({
      category: input.category,
      limit: 200,
    });
    const ranked = rankFlashcards(cards, input.query, input.limit);
    if (!ranked.length)
      return `No strong flashcard match for "${input.query}".`;

    const summaries = ranked.map((r) => toSummary(r.card));
    ctx.emit({ type: "flashcards", cards: summaries });

    return summaries
      .map(
        (c) =>
          `${c.id} | Q: ${c.question} | A: ${c.answer} | refs: ${c.refs.join(", ")} | /flashcards?card=${c.id}`,
      )
      .join("\n");
  },
});
