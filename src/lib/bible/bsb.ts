import "server-only";

import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { LIMITS } from "@/lib/agent/limits";
import { BOOKS, type Book, bookByCode, findBook } from "./books";
import { tokenize } from "./bsb-tokenize";
import type { VerseRange } from "./refs";
import { verseIdToLabel } from "./refs";

export { tokenize };

/**
 * BSB verse text for the tools. With DATABASE_URL set (production, preview,
 * local with .env.local) every read is a query on the `verses` table. Without
 * it (CI, a fresh clone) the text comes from bible.helloao.org, with timeouts,
 * and a failed load is retried later instead of being cached.
 */

const HELLOAO = "https://bible.helloao.org/api/BSB";
const TRANSLATION = "BSB";
/** Higher than any real verse number (Psalm 119 has 176). */
const LAST_VERSE = 999;

export interface BsbVerse {
  id: string;
  label: string;
  text: string;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
}

export interface LookupOptions {
  /** Stop after this many verses (default: the tool cap). */
  maxVerses?: number;
  signal?: AbortSignal;
}

function toVerse(
  book: string,
  chapter: number,
  verse: number,
  text: string,
): BsbVerse {
  const id = `${book}.${chapter}.${verse}`;
  return {
    id,
    label: verseIdToLabel(id),
    text,
    translation: TRANSLATION,
    book,
    chapter,
    verse,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error("The request was stopped.");
    err.name = "AbortError";
    throw err;
  }
}

/**
 * Verses for the given ranges, in request order, capped at `maxVerses`
 * verses and `LIMITS.tools.chaptersPerLookup` chapter ranges.
 */
export async function lookupRanges(
  ranges: VerseRange[],
  options: LookupOptions = {},
): Promise<BsbVerse[]> {
  const maxVerses = options.maxVerses ?? LIMITS.tools.versesPerLookup;
  const capped = ranges.slice(0, LIMITS.tools.chaptersPerLookup);
  if (!capped.length || maxVerses <= 0) return [];
  throwIfAborted(options.signal);
  return isDatabaseConfigured()
    ? lookupRangesDb(capped, maxVerses)
    : lookupRangesHelloao(capped, maxVerses, options.signal);
}

async function lookupRangesDb(
  ranges: VerseRange[],
  maxVerses: number,
): Promise<BsbVerse[]> {
  // book_order (not the code) so the join uses verses_order_idx in full.
  const values = sql.join(
    ranges.map(
      (r, i) =>
        sql`(${i}::int, ${bookByCode(r.book)?.order ?? 0}::smallint, ${r.chapter}::int, ${r.verseStart}::int, ${Math.min(r.verseEnd, LAST_VERSE)}::int)`,
    ),
    sql`, `,
  );
  const rows = (await getDb().execute(sql`
    select v.book, v.chapter, v.verse, v.text
    from (values ${values}) as r(ord, book_order, chapter, vs, ve)
    join verses v
      on v.translation = ${TRANSLATION}
     and v.book_order = r.book_order
     and v.chapter = r.chapter
     and v.verse between r.vs and r.ve
    order by r.ord, v.verse
    limit ${maxVerses}
  `)) as unknown as {
    book: string;
    chapter: number;
    verse: number;
    text: string;
  }[];
  const seen = new Set<string>();
  const out: BsbVerse[] = [];
  for (const row of rows) {
    const verse = toVerse(
      row.book,
      Number(row.chapter),
      Number(row.verse),
      row.text,
    );
    if (seen.has(verse.id)) continue;
    seen.add(verse.id);
    out.push(verse);
  }
  return out;
}

async function lookupRangesHelloao(
  ranges: VerseRange[],
  maxVerses: number,
  signal?: AbortSignal,
): Promise<BsbVerse[]> {
  const out: BsbVerse[] = [];
  const seen = new Set<string>();
  for (const range of ranges) {
    if (out.length >= maxVerses) break;
    const chapter = await fetchChapter(range.book, range.chapter, signal);
    const end = Math.min(
      range.verseEnd,
      Math.max(...chapter.keys(), range.verseStart),
    );
    for (let v = range.verseStart; v <= end && out.length < maxVerses; v++) {
      const text = chapter.get(v);
      if (!text) continue;
      const verse = toVerse(range.book, range.chapter, v, text);
      if (seen.has(verse.id)) continue;
      seen.add(verse.id);
      out.push(verse);
    }
  }
  return out;
}

export interface SearchOptions {
  query: string;
  testament?: "OT" | "NT";
  book?: string;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Full-text search. With the database: verses matching all terms first
 * (`websearch_to_tsquery`, so "quoted phrases" and -exclusions work), then
 * any-term matches to fill the limit (docs/SEARCH.md §5). Without it: a
 * keyword score over the helloao index.
 */
export async function searchBibleText(
  options: SearchOptions,
): Promise<BsbVerse[]> {
  const limit = Math.min(options.limit ?? 8, LIMITS.tools.searchHits);
  const tokens = tokenize(options.query);
  if (!tokens.length) return [];
  const bookFilter: Book | undefined = options.book
    ? findBook(options.book)
    : undefined;
  throwIfAborted(options.signal);
  if (isDatabaseConfigured())
    return searchDb(
      options.query,
      tokens,
      limit,
      options.testament,
      bookFilter,
    );
  return searchHelloao(
    tokens,
    limit,
    options.testament,
    bookFilter,
    options.signal,
  );
}

async function searchDb(
  query: string,
  tokens: string[],
  limit: number,
  testament: "OT" | "NT" | undefined,
  book: Book | undefined,
): Promise<BsbVerse[]> {
  const filters = sql.join(
    [
      sql`translation = ${TRANSLATION}`,
      ...(testament ? [sql`testament = ${testament}`] : []),
      ...(book ? [sql`book = ${book.code}`] : []),
    ],
    sql` and `,
  );
  type Row = { book: string; chapter: number; verse: number; text: string };
  const run = async (tsquery: ReturnType<typeof sql>, exclude: string[]) =>
    (await getDb().execute(sql`
      select book, chapter, verse, text
      from verses, ${tsquery} as q
      where ${filters} and search @@ q
        ${
          exclude.length
            ? sql`and id not in (${sql.join(
                exclude.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql``
        }
      order by ts_rank_cd(search, q) desc, book_order, chapter, verse
      limit ${limit}
    `)) as unknown as Row[];

  const all = await run(sql`websearch_to_tsquery('english', ${query})`, []);
  const verses = all.map((r) =>
    toVerse(r.book, Number(r.chapter), Number(r.verse), r.text),
  );
  if (verses.length < limit && tokens.length > 1) {
    // Tokens are [a-z0-9'] only (tokenize), so this tsquery cannot be malformed.
    const anyTerm = tokens
      .map((t) => t.replace(/'/g, ""))
      .filter(Boolean)
      .join(" | ");
    const more = await run(
      sql`to_tsquery('english', ${anyTerm})`,
      verses.map((v) => v.id),
    );
    for (const r of more) {
      if (verses.length >= limit) break;
      verses.push(toVerse(r.book, Number(r.chapter), Number(r.verse), r.text));
    }
  }
  return verses;
}

// ---- No-database fallback (bible.helloao.org) ----------------------------

type ChapterCache = Map<string, Map<number, string>>;
const chapterCache: ChapterCache = new Map();

let searchIndex: BsbVerse[] | null = null;
let searchIndexPromise: Promise<BsbVerse[]> | null = null;
let searchIndexFailedAt = 0;

/** For tests: forget cached chapters and the search index. */
export function resetBsbCache() {
  chapterCache.clear();
  searchIndex = null;
  searchIndexPromise = null;
  searchIndexFailedAt = 0;
}

function timeoutSignal(ms: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

function flattenVerseText(content: unknown[]): string {
  // Strings only: objects are footnote markers ({ noteId }). Join with a
  // space so "only" + {note} + "Son" does not become "onlySon".
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") parts.push(item);
  }
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?’”])/g, "$1")
    .trim();
}

function verseTextFromEntry(entry: {
  text?: string;
  content?: unknown[];
}): string {
  if (typeof entry.text === "string")
    return entry.text.replace(/\s+/g, " ").trim();
  if (Array.isArray(entry.content)) return flattenVerseText(entry.content);
  return "";
}

async function getJson(
  url: string,
  ms: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, { signal: timeoutSignal(ms, signal) }).catch(
    (err) => {
      throwIfAborted(signal);
      throw err;
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** One BSB chapter from helloao; only successful loads are cached. */
export async function fetchChapter(
  bookCode: string,
  chapter: number,
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const key = `${bookCode}.${chapter}`;
  const hit = chapterCache.get(key);
  if (hit) return hit;

  const book = bookByCode(bookCode);
  if (!book || chapter < 1 || chapter > book.chapters) {
    throw new Error(`Unknown chapter ${bookCode} ${chapter}`);
  }

  type ChapterJson = {
    chapter?: {
      content?: {
        type?: string;
        number?: number;
        text?: string;
        content?: unknown[];
      }[];
    };
  };
  let data: ChapterJson | null = null;
  // The simple format first; the rich one (with note markers) as a fallback.
  for (const suffix of ["simple.json", "json"]) {
    try {
      data = (await getJson(
        `${HELLOAO}/${bookCode}/${chapter}.${suffix}`,
        LIMITS.tools.fetchTimeoutMs,
        signal,
      )) as ChapterJson;
      break;
    } catch {
      throwIfAborted(signal);
    }
  }
  if (!data) {
    throw new Error(
      "Could not fetch Bible text right now. Scripture quoting is unavailable until the source responds.",
    );
  }
  const map = new Map<number, string>();
  for (const item of data.chapter?.content ?? []) {
    if (item.type !== "verse" || typeof item.number !== "number") continue;
    const text = verseTextFromEntry(item);
    if (text) map.set(item.number, text);
  }
  if (map.size) chapterCache.set(key, map);
  return map;
}

async function buildSearchIndex(signal?: AbortSignal): Promise<BsbVerse[]> {
  const data = (await getJson(
    `${HELLOAO}/complete.simple.json`,
    LIMITS.tools.searchIndexTimeoutMs,
    signal,
  )) as {
    books?: {
      id?: string;
      chapters?: {
        chapter?: {
          number?: number;
          content?: {
            type?: string;
            number?: number;
            text?: string;
            content?: unknown[];
          }[];
        };
      }[];
    }[];
  };

  const verses: BsbVerse[] = [];
  for (const book of data.books ?? []) {
    const code = book.id;
    if (!code || !bookByCode(code)) continue;
    for (const ch of book.chapters ?? []) {
      const chapter = ch.chapter?.number;
      if (typeof chapter !== "number") continue;
      for (const entry of ch.chapter?.content ?? []) {
        if (entry.type !== "verse" || typeof entry.number !== "number")
          continue;
        const text = verseTextFromEntry(entry);
        if (text) verses.push(toVerse(code, chapter, entry.number, text));
      }
    }
  }
  if (verses.length < 1000)
    throw new Error(
      "Bible search index looked incomplete; refusing to use it.",
    );
  return verses;
}

/** The helloao search index; a failed load is retried after a short pause. */
export async function getSearchIndex(
  signal?: AbortSignal,
): Promise<BsbVerse[]> {
  if (searchIndex) return searchIndex;
  if (!searchIndexPromise) {
    if (Date.now() - searchIndexFailedAt < LIMITS.tools.failedLoadRetryMs) {
      throw new Error(
        "Bible search is unavailable for a moment. Try lookup_verses with a known reference instead.",
      );
    }
    searchIndexPromise = buildSearchIndex(signal).then(
      (v) => {
        searchIndex = v;
        return v;
      },
      (err) => {
        searchIndexPromise = null;
        if (!signal?.aborted) searchIndexFailedAt = Date.now();
        throwIfAborted(signal);
        void err;
        throw new Error(
          "Could not load the Bible search index. Try lookup_verses with a known reference instead.",
        );
      },
    );
  }
  return searchIndexPromise;
}

async function searchHelloao(
  tokens: string[],
  limit: number,
  testament: "OT" | "NT" | undefined,
  bookFilter: Book | undefined,
  signal?: AbortSignal,
): Promise<BsbVerse[]> {
  const index = await getSearchIndex(signal);
  const scored: { verse: BsbVerse; score: number }[] = [];

  for (const verse of index) {
    const book = bookByCode(verse.book);
    if (!book) continue;
    if (testament && book.testament !== testament) continue;
    if (bookFilter && book.code !== bookFilter.code) continue;

    const hay = verse.text.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length > 4 ? 2 : 1;
    }
    if (score === 0) continue;
    // Prefer denser matches.
    score += tokens.filter((t) => hay.includes(t)).length / tokens.length;
    scored.push({ verse, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.verse);
}

/** Expose book list for callers that need chapter counts. */
export function allBooks() {
  return BOOKS;
}
