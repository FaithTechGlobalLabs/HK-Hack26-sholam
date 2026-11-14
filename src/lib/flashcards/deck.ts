import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { listFlashcards } from "./repo";
import type { Flashcard } from "./types";

/** Cache tag on the public deck. Anything that changes published cards
 *  must call `revalidateDeck()`. */
export const DECK_TAG = "flashcards";

/** The deck holds every published card, up to this many. */
export const DECK_LIMIT = 200;

/**
 * The public deck behind /flashcards. Cached and shared by everyone, so it
 * goes into the page's prerendered shell and Vercel's CDN serves it with no
 * function or database call. It must stay free of per-user data: no
 * cookies, no session, no arguments that depend on who is asking.
 *
 * Revalidates hourly in the background, which also picks up cards written
 * outside the app (`npm run seed:flashcards`). Order is fixed here; the
 * client shuffles (`shuffled` in ./shuffle).
 */
export async function getPublicDeck(): Promise<Flashcard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(DECK_TAG);
  return listFlashcards({ limit: DECK_LIMIT });
}

/**
 * Drop the cached deck after a card is created, hidden or edited. The next
 * visit waits for a fresh copy (`expire: 0`) rather than showing the stale
 * one, so an author sees their own card. Route handlers only; Server
 * Actions should use `updateTag(DECK_TAG)`.
 */
export function revalidateDeck(): void {
  revalidateTag(DECK_TAG, { expire: 0 });
}
