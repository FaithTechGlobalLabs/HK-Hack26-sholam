import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { flashcards } from "@/db/schema";
import seed from "../../../data/flashcards.seed.json";
import {
  type Flashcard,
  type FlashcardCategory,
  flashcardDraftSchema,
} from "./types";

const SEED_CREATED_AT = "2026-11-14T00:00:00.000Z";

// Everything except the generated tsvector, which the app never reads.
const { search: _search, ...cardColumns } = getTableColumns(flashcards);

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
 * Published cards: a Postgres full-text query over `flashcards.search` when
 * DATABASE_URL is set, otherwise the seed JSON (dev without a database, CI).
 */
export async function listFlashcards({
  q,
  category,
  limit = 50,
}: ListOptions = {}): Promise<Flashcard[]> {
  const needle = q?.trim() || undefined;
  if (!isDatabaseConfigured()) return listSeed(needle, category, limit);

  const query = needle
    ? sql`websearch_to_tsquery('english', ${needle})`
    : undefined;
  const filters: SQL[] = [eq(flashcards.status, "published")];
  if (category) filters.push(eq(flashcards.category, category));
  if (query && needle) {
    // FTS for whole words, ILIKE so partial words ("zacch") still match.
    filters.push(
      or(
        sql`${flashcards.search} @@ ${query}`,
        ilike(flashcards.question, `%${needle}%`),
      ) as SQL,
    );
  }

  const rows = await getDb()
    .select(cardColumns)
    .from(flashcards)
    .where(and(...filters))
    .orderBy(
      ...(query ? [desc(sql`ts_rank_cd(${flashcards.search}, ${query})`)] : []),
      asc(flashcards.createdAt),
      asc(flashcards.slug),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    explanation: row.explanation ?? undefined,
    refs: row.refs,
    category: row.category as FlashcardCategory,
    tone: row.tone,
    difficulty: row.difficulty,
    authorId: row.authorId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}

function listSeed(
  needle: string | undefined,
  category: FlashcardCategory | undefined,
  limit: number,
) {
  const q = needle?.toLowerCase();
  return SEED_FLASHCARDS.filter(
    (card) =>
      (!category || card.category === category) &&
      (!q || `${card.question} ${card.answer}`.toLowerCase().includes(q)),
  ).slice(0, limit);
}
