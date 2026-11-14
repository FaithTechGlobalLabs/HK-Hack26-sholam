import type { FlashcardDraft } from "@/lib/flashcards/types";

/** POST /api/flashcards. Resolves to an error message, or null on success. */
export async function saveFlashcard(
  draft: FlashcardDraft,
): Promise<string | null> {
  try {
    const res = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return body?.error ?? `Could not save the card (${res.status}).`;
  } catch {
    return "Could not reach the server.";
  }
}
