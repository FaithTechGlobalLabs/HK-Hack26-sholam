import "server-only";

import { BOOKS, type Book, bookByCode, findBook } from "./books";
import { tokenize } from "./bsb-tokenize";
import type { VerseRange } from "./refs";
import { verseIdToLabel } from "./refs";

export { tokenize };

const HELLOAO = "https://bible.helloao.org/api/BSB";
const TRANSLATION = "BSB";

export interface BsbVerse {
  id: string;
  label: string;
  text: string;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
}

type ChapterCache = Map<string, Map<number, string>>;
const chapterCache: ChapterCache = new Map();

let searchIndex: BsbVerse[] | null = null;
let searchIndexPromise: Promise<BsbVerse[]> | null = null;

function chapterKey(book: string, chapter: number) {
  return `${book}.${chapter}`;
}

function flattenVerseText(content: unknown[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") parts.push(item);
    else if (item && typeof item === "object" && "text" in item) {
      // nested text nodes are rare in simple format; ignore notes
    }
  }
  return parts.join("").replace(/\s+/g, " ").trim();
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

/** Fetch one BSB chapter; cache in memory for the process lifetime. */
export async function fetchChapter(
  bookCode: string,
  chapter: number,
): Promise<Map<number, string>> {
  const key = chapterKey(bookCode, chapter);
  const hit = chapterCache.get(key);
  if (hit) return hit;

  const book = bookByCode(bookCode);
  if (!book || chapter < 1 || chapter > book.chapters) {
    throw new Error(`Unknown chapter ${bookCode} ${chapter}`);
  }

  const res = await fetch(`${HELLOAO}/${bookCode}/${chapter}.simple.json`, {
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (!res || !res.ok) {
    // Fall back to the rich chapter endpoint.
    const rich = await fetch(`${HELLOAO}/${bookCode}/${chapter}.json`).catch(
      () => null,
    );
    if (!rich || !rich.ok)
      throw new Error(
        "Could not fetch Bible text right now. Scripture quoting is unavailable until the source responds.",
      );
    const data = (await rich.json()) as {
      chapter?: {
        content?: { type?: string; number?: number; content?: unknown[] }[];
      };
    };
    const map = new Map<number, string>();
    for (const item of data.chapter?.content ?? []) {
      if (item.type !== "verse" || typeof item.number !== "number") continue;
      const text = flattenVerseText(item.content ?? []);
      if (text) map.set(item.number, text);
    }
    chapterCache.set(key, map);
    return map;
  }

  const data = (await res.json()) as {
    chapter?: {
      content?: {
        type?: string;
        number?: number;
        text?: string;
        content?: unknown[];
      }[];
    };
  };
  const map = new Map<number, string>();
  for (const item of data.chapter?.content ?? []) {
    if (item.type !== "verse" || typeof item.number !== "number") continue;
    const text = verseTextFromEntry(item);
    if (text) map.set(item.number, text);
  }
  chapterCache.set(key, map);
  return map;
}

export async function lookupRanges(ranges: VerseRange[]): Promise<BsbVerse[]> {
  const out: BsbVerse[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    const chapter = await fetchChapter(range.book, range.chapter);
    const end =
      range.verseEnd >= Number.MAX_SAFE_INTEGER / 2
        ? Math.max(...chapter.keys(), range.verseStart)
        : range.verseEnd;
    for (let v = range.verseStart; v <= end; v++) {
      const text = chapter.get(v);
      if (!text) continue;
      const id = `${range.book}.${range.chapter}.${v}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        label: verseIdToLabel(id),
        text,
        translation: TRANSLATION,
        book: range.book,
        chapter: range.chapter,
        verse: v,
      });
    }
  }
  return out;
}

async function buildSearchIndex(): Promise<BsbVerse[]> {
  const res = await fetch(`${HELLOAO}/complete.simple.json`).catch(() => null);
  if (!res || !res.ok)
    throw new Error(
      "Could not load the Bible search index. Try lookup_verses with a known reference instead.",
    );
  const data = (await res.json()) as {
    books?: {
      id?: string;
      chapters?: {
        chapter?: {
          number?: number;
          content?: { type?: string; number?: number; text?: string }[];
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
        if (entry.type !== "verse") continue;
        if (typeof entry.number !== "number" || !entry.text) continue;
        const id = `${code}.${chapter}.${entry.number}`;
        verses.push({
          id,
          label: verseIdToLabel(id),
          text: entry.text.replace(/\s+/g, " ").trim(),
          translation: TRANSLATION,
          book: code,
          chapter,
          verse: entry.number,
        });
      }
    }
  }
  if (verses.length < 1000)
    throw new Error(
      "Bible search index looked incomplete; refusing to use it.",
    );
  return verses;
}

export async function getSearchIndex(): Promise<BsbVerse[]> {
  if (searchIndex) return searchIndex;
  searchIndexPromise ??= buildSearchIndex().then((v) => {
    searchIndex = v;
    return v;
  });
  return searchIndexPromise;
}

export async function searchBibleText(options: {
  query: string;
  testament?: "OT" | "NT";
  book?: string;
  limit?: number;
}): Promise<BsbVerse[]> {
  const tokens = tokenize(options.query);
  if (!tokens.length) return [];

  const bookFilter: Book | undefined = options.book
    ? findBook(options.book)
    : undefined;

  const index = await getSearchIndex();
  const scored: { verse: BsbVerse; score: number }[] = [];

  for (const verse of index) {
    const book = bookByCode(verse.book);
    if (!book) continue;
    if (options.testament && book.testament !== options.testament) continue;
    if (bookFilter && book.code !== bookFilter.code) continue;

    const hay = `${verse.text}`.toLowerCase();
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
  const limit = options.limit ?? 8;
  return scored.slice(0, limit).map((s) => s.verse);
}

/** Expose book list for callers that need chapter counts. */
export function allBooks() {
  return BOOKS;
}
