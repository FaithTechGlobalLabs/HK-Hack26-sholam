import { isDatabaseConfigured } from "@/db";
import seed from "../../../data/flashcards.seed.json";
import {
  type Flashcard,
  type FlashcardCategory,
  flashcardDraftSchema,
} from "./types";

const SEED_CREATED_AT = "2026-11-14T00:00:00.000Z";

/** Seed cards, validated at load so a bad edit to the JSON fails loudly. */
export const SEED_FLASHCARDS: Flashcard[] = seed.map(({ id, ...draft }) => ({
  ...flashcardDraftSchema.parse(draft),
  id,
  authorId: null,
  status: "published",
  createdAt: SEED_CREATED_AT,
}));

export interface ListOptions {
  q?: string;
  category?: FlashcardCategory;
  limit?: number;
}

/**
 * Published cards. Reads the seed JSON until the database is wired up
 * (Phase 1), then a Postgres full-text query over `flashcards.search`.
 */
export async function listFlashcards({
  q,
  category,
  limit = 50,
}: ListOptions = {}): Promise<Flashcard[]> {
  if (isDatabaseConfigured()) {
    throw new Error(
      "Database-backed listFlashcards is not implemented yet (Phase 1, see docs/PLAN.md)",
    );
  }
  const needle = q?.trim().toLowerCase();
  return SEED_FLASHCARDS.filter(
    (card) =>
      (!category || card.category === category) &&
      (!needle ||
        `${card.question} ${card.answer}`.toLowerCase().includes(needle)),
  ).slice(0, limit);
}
