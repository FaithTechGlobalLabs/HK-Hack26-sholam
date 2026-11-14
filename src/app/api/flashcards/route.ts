import { listFlashcards } from "@/lib/flashcards/repo";
import { CATEGORIES, flashcardDraftSchema } from "@/lib/flashcards/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const cards = await listFlashcards({
    q: searchParams.get("q") ?? undefined,
    category: CATEGORIES.find((c) => c === category),
  });
  return Response.json({ cards });
}

/**
 * Create a public card (from the form or an accepted chat proposal).
 * Phase 3: require a signed-in user, check refs against `verses`, insert
 * with author_id = user, return the card. Until then the draft is validated
 * and the request is refused.
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
