import { z } from "zod";
import { CATEGORIES } from "@/lib/flashcards/types";
import { defineTool, NotImplementedError } from "./types";

export const searchFlashcards = defineTool({
  name: "search_flashcards",
  description:
    "Search sholam's public Bible flashcard deck by keywords. Use it before answering trivia or fact questions, and before proposing a new card, to avoid duplicates. Returns matching cards with their ids, questions, answers and verse refs.",
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
  // Phase 2: Postgres FTS over flashcards.search (websearch_to_tsquery), emit
  // { type: "flashcards" } so the UI can render the hits as cards.
  async run() {
    throw new NotImplementedError("search_flashcards");
  },
});
