import { listFlashcards } from "@/lib/flashcards/repo";
import {
  CATEGORIES,
  flashcardDraftSchema,
  KINDS,
} from "@/lib/flashcards/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const kind = searchParams.get("kind");
  const limit = Number(searchParams.get("limit") ?? 50);
  const cards = await listFlashcards({
    q: searchParams.get("q") ?? undefined,
    kind: KINDS.find((k) => k === kind),
    category: CATEGORIES.find((c) => c === category),
    limit: Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
  });
  return Response.json({ cards });
}

/**
 * Create a public card (from the form or an accepted chat proposal).
 * Phase 3: require a signed-in user, check refs against `verses`, insert
 * with author_id = user, call `revalidateDeck()` (lib/flashcards/deck) so
 * /flashcards drops its cached deck, return the card. Until then the draft
 * is validated and the request is refused, and nothing is invalidated
 * because nothing changed.
 */
export async function POST(request: Request) {
  const parsed = flashcardDraftSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid flashcard", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return Response.json(
    {
      error:
        "Saving cards is not available yet. It arrives with the database (see docs/PLAN.md).",
    },
    { status: 501 },
  );
}
