/**
 * Imports the Berean Standard Bible into the `verses` table.
 *
 * Source: BSB USJ from https://github.com/BSB-publishing/bsb2usfm releases.
 * Licence: public domain (CC0). Pinned release and checksum below; see
 * docs/SOURCES.md. The zip is downloaded into tmp/ (gitignored), verified,
 * unpacked, parsed with src/lib/bible/usj.ts and upserted in batches, so a
 * rerun after a parser fix updates text in place.
 *
 * Run: npm run bible:import             (needs DIRECT_URL or DATABASE_URL)
 *      npm run bible:import -- --dry-run (parse and check only, no database)
 */

import "./_env";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db";
import { verses } from "../src/db/schema";
import { BOOKS } from "../src/lib/bible/books";
import { bookCodeOf, extractVerses, type UsjNode } from "../src/lib/bible/usj";
import { scriptDatabaseUrl } from "./_env";

const RELEASE = "v5.19";
const ASSET = "BSB_usj.zip";
const SHA256 =
  "783aced3c3c8a2b145e4f8c48e3b94a5a5515e050719bb8621d094be78a5269f";
const TRANSLATION = "BSB";
const BATCH = 1000;

const dryRun = process.argv.includes("--dry-run");
const workDir = path.resolve("tmp", `bsb-${RELEASE}`);
const usjDir = path.join(workDir, "usj");

async function ensureSource() {
  const zip = path.join(workDir, ASSET);
  if (!existsSync(zip)) {
    mkdirSync(workDir, { recursive: true });
    const url = `https://github.com/BSB-publishing/bsb2usfm/releases/download/${RELEASE}/${ASSET}`;
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const sha = createHash("sha256").update(readFileSync(zip)).digest("hex");
  if (sha !== SHA256) throw new Error(`Checksum mismatch for ${ASSET}: ${sha}`);
  if (!existsSync(usjDir))
    execFileSync("unzip", ["-q", "-o", zip, "-d", usjDir]);
}

function parseAll() {
  const rows: (typeof verses.$inferInsert)[] = [];
  let chapters = 0;
  for (const book of BOOKS) {
    const usj = JSON.parse(
      readFileSync(path.join(usjDir, `${book.code}.usj`), "utf8"),
    ) as UsjNode;
    if (bookCodeOf(usj) !== book.code)
      throw new Error(`${book.code}.usj declares ${bookCodeOf(usj)}`);
    const extracted = extractVerses(usj);
    const bookChapters = new Set(extracted.map((v) => v.chapter));
    if (bookChapters.size !== book.chapters) {
      throw new Error(
        `${book.code}: ${bookChapters.size} chapters, expected ${book.chapters}`,
      );
    }
    chapters += bookChapters.size;
    for (const v of extracted) {
      rows.push({
        translation: TRANSLATION,
        id: `${book.code}.${v.chapter}.${v.verse}`,
        book: book.code,
        bookOrder: book.order,
        testament: book.testament,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
      });
    }
  }
  return { rows, chapters };
}

function check(rows: { id: string; text: string }[], chapters: number) {
  const byId = new Map(rows.map((r) => [r.id, r.text]));
  const expect = (id: string, text: string) => {
    if (byId.get(id) !== text)
      throw new Error(`Spot check ${id}: got ${JSON.stringify(byId.get(id))}`);
  };
  expect("JHN.11.35", "Jesus wept.");
  expect(
    "JHN.3.16",
    "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.",
  );
  expect(
    "MAT.5.9",
    "Blessed are the peacemakers, for they will be called sons of God.",
  );
  if (chapters !== 1189)
    throw new Error(`Expected 1,189 chapters, got ${chapters}`);
  if (byId.size !== rows.length) throw new Error("Duplicate verse ids");
  console.log(
    `Parsed ${rows.length} verses in ${chapters} chapters; spot checks pass.`,
  );
}

async function main() {
  await ensureSource();
  const { rows, chapters } = parseAll();
  check(rows, chapters);
  if (dryRun) {
    writeFileSync(
      path.join(workDir, "verses.jsonl"),
      rows.map((r) => JSON.stringify(r)).join("\n"),
    );
    console.log(`Dry run: wrote ${path.join(workDir, "verses.jsonl")}`);
    return;
  }

  const db = createDb(scriptDatabaseUrl(), { max: 1 });
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += BATCH) {
        await tx
          .insert(verses)
          .values(rows.slice(i, i + BATCH))
          .onConflictDoUpdate({
            target: [verses.translation, verses.id],
            set: { text: sql`excluded.text` },
          });
      }
    });
    const [{ count }] = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from verses where translation = ${TRANSLATION}`,
    );
    if (count !== rows.length)
      throw new Error(
        `Database has ${count} ${TRANSLATION} verses, expected ${rows.length}`,
      );
    console.log(`Imported ${count} ${TRANSLATION} verses.`);
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
