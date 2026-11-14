/**
 * One-time import of the Berean Standard Bible into the `verses` table.
 * Phase 1. Not implemented yet; this file pins the plan.
 *
 * Source: BSB USJ (JSON) from the GitHub releases of
 *   https://github.com/BSB-publishing/bsb2usfm  (v5.2 when checked, 2026-11-14)
 * Licence: public domain (CC0), dedicated 2023-04-30. See docs/SOURCES.md.
 * Fallback source: https://bible.helloao.org/api/BSB/{BOOK}/{chapter}.json
 *   (no key, cache and store allowed), 1,189 chapter requests.
 *
 * Steps:
 *   1. Download the release asset into tmp/bsb/ (gitignored); record its
 *      version and sha256 in docs/SOURCES.md.
 *   2. For each of the 66 books in src/lib/bible/books.ts, walk the USJ
 *      tree: collect verse text between `verse` markers, drop footnotes
 *      (`note`), cross-references and Strong's/word attributes, keep
 *      words of Jesus as plain text, normalise whitespace.
 *   3. Insert rows { translation: "BSB", id: "JHN.3.16", book, bookOrder,
 *      testament, chapter, verse, text } in batches of 1,000 inside one
 *      transaction, `on conflict do nothing` so a rerun is safe.
 *   4. Check: about 31,100 verses (KJV versification has 31,102; take the
 *      exact BSB total from the release), 1,189 chapters, and spot-check
 *      JHN.11.35 = "Jesus wept."
 *
 * Run: DATABASE_URL=... npm run bible:import
 */

console.error("import-bible: not implemented yet (Phase 1, see docs/PLAN.md).");
process.exit(1);
