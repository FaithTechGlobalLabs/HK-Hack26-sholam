import { bookByCode, findBook } from "./books";

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

const WHOLE_CHAPTER_END = Number.MAX_SAFE_INTEGER;

/**
 * Parses human references such as "John 3:16-18", "1 Cor 13:4", "Ps 23",
 * or "1 Cor 13:4, 7" into ranges. Whole-chapter refs use verseEnd =
 * Number.MAX_SAFE_INTEGER so the fetcher can clamp to real verse counts.
 */
export function parseReference(input: string): VerseRange[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Split book name from the chapter/verse part. Walk from the end until
  // findBook accepts the left side.
  const match = trimmed.match(/^(.+?)\s+(\d{1,3})(?:\s*:\s*([\d,\-\s]+))?$/i);
  if (!match) return [];

  const book = findBook(match[1]);
  if (!book) return [];
  const chapter = Number(match[2]);
  if (chapter < 1 || chapter > book.chapters) return [];

  const versePart = match[3]?.trim();
  if (!versePart) {
    return [
      {
        book: book.code,
        chapter,
        verseStart: 1,
        verseEnd: WHOLE_CHAPTER_END,
      },
    ];
  }

  const ranges: VerseRange[] = [];
  for (const chunk of versePart.split(",")) {
    const piece = chunk.trim();
    if (!piece) continue;
    const range = piece.match(/^(\d{1,3})\s*-\s*(\d{1,3})$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start) continue;
      ranges.push({
        book: book.code,
        chapter,
        verseStart: start,
        verseEnd: end,
      });
      continue;
    }
    const single = piece.match(/^(\d{1,3})$/);
    if (single) {
      const v = Number(single[1]);
      if (v < 1) continue;
      ranges.push({
        book: book.code,
        chapter,
        verseStart: v,
        verseEnd: v,
      });
    }
  }
  return ranges;
}
