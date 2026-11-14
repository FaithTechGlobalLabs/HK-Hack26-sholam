import { z } from "zod";
import { defineTool, NotImplementedError } from "./types";

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
  // Phase 2: parseReference() -> select from `verses` (cap ~60 verses per
  // call), add each to ctx.versesSeen, emit { type: "verses" }, return
  // "JHN.3.16 | For God so loved..." lines. Unknown refs come back as errors.
  async run() {
    throw new NotImplementedError("lookup_verses");
  },
});
