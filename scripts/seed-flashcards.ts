/**
 * Upserts data/flashcards.seed.json into `flashcards`, keyed by slug (the
 * seed `id`), so reruns update cards in place. Every ref must exist in the
 * imported `verses` table first (run `npm run bible:import`).
 *
 * Run: npm run seed:flashcards              (needs DIRECT_URL or DATABASE_URL)
 *      npm run seed:flashcards -- --check   (validate the JSON only)
 */

import "./_env";
import { inArray, sql } from "drizzle-orm";
import { createDb } from "../src/db";
import { flashcards, verses } from "../src/db/schema";
import { SEED_FLASHCARDS } from "../src/lib/flashcards/repo";
import { scriptDatabaseUrl } from "./_env";

async function main() {
  // Importing repo.ts parsed every card with flashcardDraftSchema already.
  console.log(`${SEED_FLASHCARDS.length} seed cards valid.`);
  if (process.argv.includes("--check")) return;

  const db = createDb(scriptDatabaseUrl(), { max: 1 });
  try {
    const refs = [...new Set(SEED_FLASHCARDS.flatMap((c) => c.refs))];
    const found = await db
      .select({ id: verses.id })
      .from(verses)
      .where(
        sql`${verses.translation} = 'BSB' and ${inArray(verses.id, refs)}`,
      );
    const missing = refs.filter((r) => !found.some((f) => f.id === r));
    if (missing.length)
      throw new Error(
        `Refs not in verses (import the Bible first?): ${missing.join(", ")}`,
      );

    for (const card of SEED_FLASHCARDS) {
      const values = {
        slug: card.id,
        question: card.question,
        answer: card.answer,
        explanation: card.explanation ?? null,
        category: card.category,
        tone: card.tone,
        difficulty: card.difficulty,
        refs: card.refs,
        authorId: null,
        status: "published" as const,
      };
      await db
        .insert(flashcards)
        .values(values)
        .onConflictDoUpdate({ target: flashcards.slug, set: values });
    }
    const [{ count }] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from flashcards where slug like 'seed-%'`,
    );
    console.log(
      `Upserted ${SEED_FLASHCARDS.length} cards; ${count} seed cards in the database.`,
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
  console.error(
    (err instanceof Error ? err.message.split("\n")[0] : String(err)) + cause,
  );
  process.exit(1);
});
