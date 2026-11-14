import { z } from "zod";
import { CATEGORIES, KINDS } from "@/lib/flashcards/types";
import { defineTool, NotImplementedError } from "./types";

export const searchFlashcards = defineTool({
  name: "search_flashcards",
  description:
    "Search sholam's public Bible card deck by keywords. The deck has two kinds: fact cards (a question with an answer and verse ids) and discover cards (an open question with Scripture starting points and no fixed answer). Use it before answering trivia or fact questions, when a question sounds like a discover card, and before proposing a new card, to avoid duplicates. Returns matching cards with ids, kind, question, answer (fact cards) and passage refs.",
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
    limit: z.number().int().min(1).max(10).default(5),
  }),
  // Phase 2: Postgres FTS over flashcards.search (websearch_to_tsquery), emit
  // { type: "flashcards" } so the UI can render the hits as cards.
  async run() {
    throw new NotImplementedError("search_flashcards");
  },
});
