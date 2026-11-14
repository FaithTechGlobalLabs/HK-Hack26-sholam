import { bookByCode } from "./books";

/** `BOOK.chapter.verse`, e.g. `JHN.3.16`. */
export type VerseId = `${string}.${number}.${number}`;

export interface VerseRange {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

const VERSE_ID = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseVerseId(
  id: string,
): { book: string; chapter: number; verse: number } | null {
  const m = VERSE_ID.exec(id);
  if (!m) return null;
  const book = bookByCode(m[1]);
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  if (!book || chapter < 1 || chapter > book.chapters || verse < 1) return null;
  return { book: book.code, chapter, verse };
}

export function isVerseId(id: string): id is VerseId {
  return parseVerseId(id) !== null;
}

/** `JHN.3.16` -> `John 3:16`. Returns the input unchanged if it is not a valid id. */
export function verseIdToLabel(id: string): string {
  const parsed = parseVerseId(id);
  if (!parsed) return id;
  return `${bookByCode(parsed.book)?.name} ${parsed.chapter}:${parsed.verse}`;
}

/**
 * Parses human references such as "John 3:16-18", "1 Cor 13:4" or
 * "Ps 23" into ranges. Phase 2: implement with `findBook` and validate verse
 * bounds against the `verses` table (verse counts are not in `BOOKS`).
 */
export function parseReference(_input: string): VerseRange[] {
  throw new Error(
    "parseReference is not implemented yet (Phase 2, see docs/PLAN.md)",
  );
}
