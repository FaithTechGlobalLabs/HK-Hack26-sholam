import { z } from "zod";
import { lookupRanges } from "@/lib/bible/bsb";
import {
  parsePassageRef,
  parseReference,
  passageToVerseRanges,
  type VerseRange,
} from "@/lib/bible/refs";
import { defineTool } from "./types";

export const lookupVerses = defineTool({
  name: "lookup_verses",
  description:
    "Fetch the exact text of Bible verses by reference. Accepts human references such as 'John 3:16', 'John 3:16-18', '1 Cor 13:4-7' or 'Psalm 23'. Returns each verse with its id (BOOK.chapter.verse) for citations. Always use this before quoting a verse.",
  inputSchema: z.strictObject({
    references: z
      .array(z.string().min(2))
      .min(1)
      .max(10)
      .describe("One reference per item"),
  }),
  async run(input, ctx) {
    const verses = [];
    const errors: string[] = [];

    for (const ref of input.references) {
      let ranges: VerseRange[];
      try {
        ranges = parseReference(ref).flatMap((id) => {
          const passage = parsePassageRef(id);
          return passage ? passageToVerseRanges(passage) : [];
        });
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `Could not parse reference: ${ref}`,
        );
        continue;
      }
      if (!ranges.length) {
        errors.push(`Could not parse reference: ${ref}`);
        continue;
      }
      try {
        const found = await lookupRanges(ranges);
        if (!found.length) {
          errors.push(`No verses found for: ${ref}`);
          continue;
        }
        // Cap ~60 verses per call across all refs.
        for (const v of found) {
          if (verses.length >= 60) break;
          verses.push(v);
        }
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : `Failed to fetch ${ref}`,
        );
      }
    }

    if (verses.length) {
      for (const v of verses) {
        ctx.versesSeen.set(v.id, {
          id: v.id,
          label: v.label,
          text: v.text,
          translation: v.translation,
        });
      }
      ctx.emit({
        type: "verses",
        verses: verses.map((v) => ({
          id: v.id,
          label: v.label,
          text: v.text,
          translation: v.translation,
        })),
      });
    }

    const lines = verses.map((v) => `${v.id} | ${v.text}`);
    if (errors.length) lines.push(`Errors: ${errors.join("; ")}`);
    if (!lines.length) throw new Error(errors.join("; ") || "No verses found");
    return lines.join("\n");
  },
});
