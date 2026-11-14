/**
 * Validates data/flashcards.seed.json and, in Phase 1, upserts it into the
 * `flashcards` table by slug (the seed `id`), so reruns update in place.
 *
 * Run: npm run seed:flashcards            (validate only)
 *      DATABASE_URL=... npm run seed:flashcards   (Phase 1: validate + upsert)
 */

import { SEED_FLASHCARDS } from "../src/lib/flashcards/repo";

// Importing repo.ts parses every card with flashcardDraftSchema and throws on
// the first invalid one, so reaching this line means the file is valid.
console.log(`seed-flashcards: ${SEED_FLASHCARDS.length} cards valid.`);

if (process.env.DATABASE_URL) {
  console.error(
    "seed-flashcards: database upsert is not implemented yet (Phase 1, see docs/PLAN.md).",
  );
  process.exit(1);
}
