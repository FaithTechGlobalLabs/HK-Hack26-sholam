/**
 * Upserts the seed decks into `flashcards`, keyed by slug (the seed `id`), so
 * reruns update cards in place:
 *   data/flashcards.seed.json   fact cards (question + answer + verse ids)
 *   data/faithmap.cards.json    discover cards (FaithMap open questions;
 *                               regenerate with `npm run faithmap:convert`)
 * Every passage ref must resolve in the imported `verses` table first: the
 * first verse and the last verse of each range or chapter must exist.
 *
 * Run: npm run seed:flashcards              (needs DIRECT_URL or DATABASE_URL)
 *      npm run seed:flashcards -- --check   (validate the JSON only)
 */

import "./_env";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db";
import { flashcards } from "../src/db/schema";
import { parsePassageRef } from "../src/lib/bible/refs";
import { SEED_DISCOVER, SEED_FLASHCARDS } from "../src/lib/flashcards/repo";
import { scriptDatabaseUrl } from "./_env";

async function main() {
  // Importing repo.ts parsed every card with its zod schema already.
  console.log(
    `${SEED_FLASHCARDS.length} fact cards and ${SEED_DISCOVER.length} discover cards valid.`,
  );
  if (process.argv.includes("--check")) return;

  const db = createDb(scriptDatabaseUrl(), { max: 1 });
  try {
    // Last verse number of every chapter, to resolve chapter refs and check ranges.
    const lastVerse = new Map<string, number>();
    for (const r of await db.execute<{
      book: string;
      chapter: number;
      last: number;
    }>(
      sql`select book, chapter, max(verse)::int as last from verses where translation = 'BSB' group by book, chapter`,
    )) {
      lastVerse.set(`${r.book}.${r.chapter}`, r.last);
    }
    const ids = new Set(
      (
        await db.execute<{ id: string }>(
          sql`select id from verses where translation = 'BSB'`,
        )
      ).map((r) => r.id),
    );

    const problems: string[] = [];
    for (const card of [...SEED_FLASHCARDS, ...SEED_DISCOVER]) {
      for (const ref of card.refs) {
        const p = parsePassageRef(ref);
        const endLast = p
          ? lastVerse.get(`${p.book}.${p.endChapter}`)
          : undefined;
        const first = p
          ? `${p.book}.${p.startChapter}.${p.startVerse ?? 1}`
          : "";
        const last =
          p && endLast
            ? `${p.book}.${p.endChapter}.${p.endVerse ?? endLast}`
            : "";
        if (!ids.has(first) || !ids.has(last))
          problems.push(`${card.id}: ${ref}`);
      }
    }
    if (problems.length)
      throw new Error(`Refs not found in verses:\n  ${problems.join("\n  ")}`);

    for (const card of SEED_FLASHCARDS) {
      const values = {
        slug: card.id,
        kind: "fact" as const,
        question: card.question,
        answer: card.answer,
        explanation: card.explanation ?? null,
        category: card.category,
        tone: card.tone,
        difficulty: card.difficulty,
        refs: card.refs,
        tags: [],
        minutes: null,
        section: null,
        source: "sholam-seed",
        authorId: null,
        status: "published" as const,
      };
      await db
        .insert(flashcards)
        .values(values)
        .onConflictDoUpdate({ target: flashcards.slug, set: values });
    }
    for (const card of SEED_DISCOVER) {
      const values = {
        slug: card.id,
        kind: "discover" as const,
        question: card.question,
        answer: null,
        explanation: null,
        category: card.category,
        tone: null,
        difficulty: card.difficulty ?? null,
        refs: card.refs,
        tags: card.tags,
        minutes: card.minutes ?? null,
        section: card.section,
        source: card.source,
        authorId: null,
        status: "published" as const,
      };
      await db
        .insert(flashcards)
        .values(values)
        .onConflictDoUpdate({ target: flashcards.slug, set: values });
    }

    const counts = await db.execute<{ kind: string; n: number }>(
      sql`select kind, count(*)::int as n from flashcards where author_id is null group by kind order by kind`,
    );
    console.log(
      `Seeded. In the database: ${counts.map((c) => `${c.n} ${c.kind}`).join(", ")}.`,
    );
  } finally {
    await db.$close();
  }
}

main().catch((err) => {
  // Drizzle wraps the driver error; its cause has the Postgres message.
  const cause =
    err instanceof Error && err.cause instanceof Error
      ? ` (${err.cause.message})`
      : "";
  console.error((err instanceof Error ? err.message : String(err)) + cause);
  process.exit(1);
});
