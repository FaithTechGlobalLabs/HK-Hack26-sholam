import { z } from "zod";
import { LIMITS } from "@/lib/agent/limits";
import { type BsbVerse, lookupRanges } from "@/lib/bible/bsb";
import {
  parsePassageRef,
  parseReference,
  passageToVerseRanges,
  type VerseRange,
} from "@/lib/bible/refs";
import { defineTool } from "./types";

const MAX_VERSES = LIMITS.tools.versesPerLookup;

export const lookupVerses = defineTool({
  name: "lookup_verses",
  description: `Fetch the exact text of Bible verses by reference. Accepts human references such as 'John 3:16', 'John 3:16-18', '1 Cor 13:4-7' or 'Psalm 23'. Returns each verse with its id (BOOK.chapter.verse) for citations. Always use this before quoting or citing a verse; put every reference you need in one call. Returns at most ${MAX_VERSES} verses per call, so ask for short passages.`,
  inputSchema: z.strictObject({
    references: z
      .array(z.string().min(2))
      .min(1)
      .max(10)
      .describe("One reference per item"),
  }),
  async run(input, ctx) {
    const verses: BsbVerse[] = [];
    const errors: string[] = [];
    const notes: string[] = [];

    for (const ref of input.references) {
      const room = MAX_VERSES - verses.length;
      if (room <= 0) {
        notes.push(
          `Skipped ${ref}: the ${MAX_VERSES}-verse limit was reached.`,
        );
        continue;
      }
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
        // One extra verse tells us whether the passage was cut.
        const found = await lookupRanges(ranges, {
          maxVerses: room + 1,
          signal: ctx.signal,
        });
        if (!found.length) {
          errors.push(`No verses found for: ${ref}`);
          continue;
        }
        const kept = found.slice(0, room);
        if (
          found.length > room ||
          ranges.length > LIMITS.tools.chaptersPerLookup
        ) {
          notes.push(
            `${ref} was cut after ${kept.at(-1)?.id}. Ask for a shorter passage if you need more.`,
          );
        }
        verses.push(...kept);
      } catch (err) {
        if (ctx.signal?.aborted) throw err;
        errors.push(
          err instanceof Error ? err.message : `Failed to fetch ${ref}`,
        );
      }
    }

    if (verses.length) {
      const records = verses.map((v) => ({
        id: v.id,
        label: v.label,
        text: v.text,
        translation: v.translation,
      }));
      for (const r of records) ctx.versesSeen.set(r.id, r);
      ctx.emit({ type: "verses", verses: records });
    }

    const lines = verses.map((v) => `${v.id} | ${v.text}`);
    lines.push(...notes);
    if (errors.length) lines.push(`Errors: ${errors.join("; ")}`);
    if (!verses.length) throw new Error(errors.join("; ") || "No verses found");
    return lines.join("\n");
  },
});
