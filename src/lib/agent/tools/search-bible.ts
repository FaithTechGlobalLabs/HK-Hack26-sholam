import { z } from "zod";
import { defineTool, NotImplementedError } from "./types";

export const searchBible = defineTool({
  name: "search_bible",
  description:
    "Full-text search over Bible verses when you do not know the reference, e.g. 'peace that surpasses understanding' or 'love your enemies'. Returns the best-matching verses with ids and text. Prefer lookup_verses when you already know the reference.",
  inputSchema: z.strictObject({
    query: z.string().min(2).describe("Words or a phrase to search for"),
    testament: z.enum(["OT", "NT"]).optional(),
    book: z
      .string()
      .optional()
      .describe("Limit to one book, by name or code, e.g. 'Psalms' or 'PSA'"),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  // Phase 2: websearch_to_tsquery over verses.search ranked by ts_rank_cd,
  // add hits to ctx.versesSeen, emit { type: "verses" }.
  async run() {
    throw new NotImplementedError("search_bible");
  },
});
