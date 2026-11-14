import { z } from "zod";
import { LIMITS } from "@/lib/agent/limits";
import { searchBibleText } from "@/lib/bible/bsb";
import { defineTool } from "./types";

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
    limit: z.number().int().min(1).max(LIMITS.tools.searchHits).default(8),
  }),
  async run(input, ctx) {
    const hits = await searchBibleText({
      query: input.query,
      testament: input.testament,
      book: input.book,
      limit: input.limit,
      signal: ctx.signal,
    });
    if (!hits.length) return `No verses matched "${input.query}".`;

    const records = hits.map((v) => ({
      id: v.id,
      label: v.label,
      text: v.text,
      translation: v.translation,
    }));
    for (const r of records) ctx.versesSeen.set(r.id, r);
    ctx.emit({ type: "verses", verses: records });

    return hits.map((v) => `${v.id} | ${v.text}`).join("\n");
  },
});
