import { z } from "zod";
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
    limit: z.number().int().min(1).max(20).default(8),
  }),
  async run(input, ctx) {
    const hits = await searchBibleText({
      query: input.query,
      testament: input.testament,
      book: input.book,
      limit: input.limit,
    });
    if (!hits.length) return `No verses matched "${input.query}".`;

    for (const v of hits) {
      ctx.versesSeen.set(v.id, {
        id: v.id,
        label: v.label,
        text: v.text,
        translation: v.translation,
      });
    }
    ctx.emit({
      type: "verses",
      verses: hits.map((v) => ({
        id: v.id,
        label: v.label,
        text: v.text,
        translation: v.translation,
      })),
    });

    return hits.map((v) => `${v.id} | ${v.text}`).join("\n");
  },
});
