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
import discoverSeed from "../../../data/faithmap.cards.json";
import factSeed from "../../../data/flashcards.seed.json";
import {
  type CardKind,
  type DiscoverCard,
  type DiscoverCardSeed,
  discoverCardSchema,
  type FactCard,
  type Flashcard,
  type FlashcardCategory,
  flashcardDraftSchema,
} from "./types";

const SEED_CREATED_AT = "2026-11-14T00:00:00.000Z";
const seedMeta = {
  authorId: null,
  status: "published" as const,
  createdAt: SEED_CREATED_AT,
};

/** Seed cards, validated at load so a bad edit to the JSON fails loudly. */
export const SEED_FLASHCARDS: FactCard[] = factSeed.map(({ id, ...draft }) => ({
  ...flashcardDraftSchema.parse(draft),
  ...seedMeta,
  id,
  kind: "fact",
}));

export const SEED_DISCOVER: DiscoverCard[] = discoverSeed.map(
  ({ id, ...card }) => {
    const { kind: _kind, ...rest }: DiscoverCardSeed =
      discoverCardSchema.parse(card);
    return { ...rest, ...seedMeta, id, kind: "discover" };
  },
);

export const ALL_SEED_CARDS: Flashcard[] = [
  ...SEED_FLASHCARDS,
  ...SEED_DISCOVER,
];

export interface ListOptions {
  q?: string;
  kind?: CardKind;
  category?: FlashcardCategory;
  limit?: number;
}

// Everything except the generated tsvector, which the app never reads.
const { search: _search, ...cardColumns } = getTableColumns(flashcards);
type CardRow = Omit<typeof flashcards.$inferSelect, "search">;

/**
 * Published cards: a Postgres full-text query over `flashcards.search` when
 * DATABASE_URL is set, otherwise the seed JSON (dev without a database, CI).
 */
export async function listFlashcards({
  q,
  kind,
  category,
  limit = 50,
}: ListOptions = {}): Promise<Flashcard[]> {
  const needle = q?.trim() || undefined;
  if (!isDatabaseConfigured()) return listSeed(needle, kind, category, limit);

  const query = needle
    ? sql`websearch_to_tsquery('english', ${needle})`
    : undefined;
  const filters: SQL[] = [eq(flashcards.status, "published")];
  if (kind) filters.push(eq(flashcards.kind, kind));
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
      asc(flashcards.kind),
      asc(flashcards.createdAt),
      asc(flashcards.slug),
    )
    .limit(limit);

  return rows.map(toCard);
}

function toCard(row: CardRow): Flashcard {
  const meta = {
    id: row.id,
    question: row.question,
    refs: row.refs,
    authorId: row.authorId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.kind === "discover") {
    return {
      ...meta,
      kind: "discover",
      category: row.category as DiscoverCard["category"],
      section: row.section ?? "",
      tags: row.tags,
      minutes: row.minutes ?? undefined,
      difficulty: row.difficulty ?? undefined,
      source: row.source ?? "",
    };
  }
  return {
    ...meta,
    kind: "fact",
    category: row.category as FactCard["category"],
    // The flashcards_fact_fields check guarantees these for fact cards.
    answer: row.answer ?? "",
    explanation: row.explanation ?? undefined,
    tone: row.tone ?? "fact",
    difficulty: row.difficulty ?? 1,
  };
}

function listSeed(
  needle: string | undefined,
  kind: CardKind | undefined,
  category: FlashcardCategory | undefined,
  limit: number,
) {
  const q = needle?.toLowerCase();
  return ALL_SEED_CARDS.filter(
    (card) =>
      (!kind || card.kind === kind) &&
      (!category || card.category === category) &&
      (!q ||
        `${card.question} ${card.kind === "fact" ? card.answer : card.section}`
          .toLowerCase()
          .includes(q)),
  ).slice(0, limit);
}
