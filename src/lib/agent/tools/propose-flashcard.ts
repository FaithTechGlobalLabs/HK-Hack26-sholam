import { flashcardDraftSchema } from "@/lib/flashcards/types";
import { defineTool, NotImplementedError } from "./types";

export const proposeFlashcard = defineTool({
  name: "propose_flashcard",
  description:
    "Offer the user a new flashcard for the public deck. This does not save anything: the user sees the draft and decides whether to add it. Only propose after search_flashcards found no matching card and after you fetched every referenced verse with lookup_verses.",
  inputSchema: flashcardDraftSchema,
  // Phase 2: check every ref exists in `verses` (reject unknown ids with a
  // tool error the model can fix), then emit { type: "flashcard_proposal" }.
  // Saving happens in POST /api/flashcards when the user presses "Add to deck".
  async run() {
    throw new NotImplementedError("propose_flashcard");
  },
});
