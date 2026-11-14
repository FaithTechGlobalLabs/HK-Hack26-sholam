import { isVerseId } from "@/lib/bible/refs";
import { flashcardDraftSchema } from "@/lib/flashcards/types";
import { defineTool } from "./types";

export const proposeFlashcard = defineTool({
  name: "propose_flashcard",
  description:
    "Offer the user a new flashcard for the public deck. This does not save anything: the user sees the draft and decides whether to add it. Only propose after search_flashcards found no matching card and after you fetched every referenced verse with lookup_verses.",
  inputSchema: flashcardDraftSchema,
  async run(input, ctx) {
    const bad = input.refs.filter((id) => !isVerseId(id));
    if (bad.length) throw new Error(`Invalid verse ids: ${bad.join(", ")}`);

    for (const id of input.refs) {
      if (!ctx.versesSeen.has(id)) {
        throw new Error(
          `Verse ${id} was not fetched this turn. Call lookup_verses first.`,
        );
      }
    }

    ctx.emit({ type: "flashcard_proposal", draft: input });
    return `Draft shown to the user (not saved): ${input.question}`;
  },
});
