import { bookByCode, findBook } from "./books";

/** `BOOK.chapter.verse`, e.g. `JHN.3.16`. */
export type VerseId = `${string}.${number}.${number}`;

/**
 * A passage reference, stored on cards and returned by `parseReference`:
 *   verse          JHN.3.16
 *   verse range    MAT.18.21-MAT.18.35   (may cross chapters: GEN.1.1-GEN.2.3)
 *   chapter        DAN.4
 *   chapter range  GEN.1-GEN.2
 * Every verse id is also a passage ref.
 */
export type PassageRef = string;

export interface Passage {
  book: string;
  startChapter: number;
  /** null = from the start of the chapter */
  startVerse: number | null;
  endChapter: number;
  /** null = to the end of the chapter */
  endVerse: number | null;
}

const VERSE_ID = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})\.(\d{1,3})$/;
const POINT = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3}))?$/;

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

function parsePoint(text: string) {
  const m = POINT.exec(text);
  if (!m) return null;
  const book = bookByCode(m[1]);
  const chapter = Number(m[2]);
  const verse = m[3] === undefined ? null : Number(m[3]);
  if (!book || chapter < 1 || chapter > book.chapters || verse === 0)
    return null;
  return { book: book.code, chapter, verse };
}

/** Structural check only; verse bounds are checked against the database. */
export function parsePassageRef(ref: string): Passage | null {
  const [a, b, extra] = ref.split("-");
  if (extra !== undefined) return null;
  const start = parsePoint(a);
  if (!start) return null;
  const end = b === undefined ? start : parsePoint(b);
  if (!end || end.book !== start.book) return null;
  // Both ends must be the same kind: verse–verse or chapter–chapter.
  if ((start.verse === null) !== (end.verse === null)) return null;
  const order = (p: { chapter: number; verse: number | null }) =>
    p.chapter * 1000 + (p.verse ?? 0);
  if (order(end) < order(start)) return null;
  return {
    book: start.book,
    startChapter: start.chapter,
    startVerse: start.verse,
    endChapter: end.chapter,
    endVerse: end.verse,
  };
}

export function isPassageRef(ref: string): boolean {
  return parsePassageRef(ref) !== null;
}

/** `MAT.18.21-MAT.18.35` -> `Matthew 18:21–35`; `GEN.1-GEN.2` -> `Genesis 1–2`. */
export function passageLabel(ref: string): string {
  const p = parsePassageRef(ref);
  if (!p) return ref;
  const name = bookByCode(p.book)?.name ?? p.book;
  if (p.startVerse === null) {
    return p.endChapter === p.startChapter
      ? `${name} ${p.startChapter}`
      : `${name} ${p.startChapter}–${p.endChapter}`;
  }
  const start = `${name} ${p.startChapter}:${p.startVerse}`;
  if (p.endChapter === p.startChapter && p.endVerse === p.startVerse)
    return start;
  return p.endChapter === p.startChapter
    ? `${start}–${p.endVerse}`
    : `${start}–${p.endChapter}:${p.endVerse}`;
}

/** The ids of a passage's first and last verse (chapters start at verse 1). */
export function passageEndpoints(p: Passage): {
  first: VerseId;
  lastChapter: number;
  lastVerse: number | null;
} {
  return {
    first: `${p.book}.${p.startChapter}.${p.startVerse ?? 1}` as VerseId,
    lastChapter: p.endChapter,
    lastVerse: p.endVerse,
  };
}

const BOOK_AND_REST = /^((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]*?)\s*(\d.*)$/;
const NUMBERS =
  /^(\d{1,3})(?::(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3})(?::(\d{1,3}))?)?$/;

/**
 * Parses human references into passage refs:
 *   "John 3:16"              -> ["JHN.3.16"]
 *   "Matthew 18:21–35"       -> ["MAT.18.21-MAT.18.35"]
 *   "Genesis 1:1–2:3"        -> ["GEN.1.1-GEN.2.3"]
 *   "Daniel 4", "Hosea 1–3"  -> ["DAN.4"], ["HOS.1-HOS.3"]
 *   "Galatians 1:10, John 12:42–43; 1 Cor 13:4, 7"
 *                            -> ["GAL.1.10", "JHN.12.42-JHN.12.43", "1CO.13.4", "1CO.13.7"]
 * A bare number after a comma continues the previous book and chapter.
 * Throws on an unknown book or a malformed part; verse bounds are not checked
 * here (the `verses` table knows them).
 */
export function parseReference(input: string): PassageRef[] {
  const out: PassageRef[] = [];
  let book: string | null = null;
  let chapter: number | null = null;
  let lastHadVerse = false;

  for (const raw of input.split(/[;,]/)) {
    const part = raw.trim().replace(/\.$/, "");
    if (!part) continue;

    let numbers = part;
    const named = BOOK_AND_REST.exec(part);
    if (named && /[A-Za-z]/.test(named[1])) {
      const found = findBook(named[1]);
      if (!found) throw new Error(`Unknown book in "${part}"`);
      book = found.code;
      chapter = null;
      numbers = named[2];
    } else if (!book) {
      throw new Error(`No book given for "${part}"`);
    }

    const m = NUMBERS.exec(numbers.trim());
    if (!m) throw new Error(`Cannot read "${part}"`);
    const [, n1, n2, n3, n4] = m;

    let ref: PassageRef;
    const continuesVerses =
      !named && lastHadVerse && chapter !== null && n2 === undefined;
    if (continuesVerses) {
      // "…13:4, 7" or "…13:4, 7-9": verses in the previous chapter.
      ref = n3
        ? `${book}.${chapter}.${n1}-${book}.${chapter}.${n3}`
        : `${book}.${chapter}.${n1}`;
    } else if (n2 === undefined) {
      // Chapter or chapter range: "Daniel 4", "Hosea 1–3".
      chapter = Number(n1);
      lastHadVerse = false;
      ref = n3 ? `${book}.${n1}-${book}.${n3}` : `${book}.${n1}`;
    } else {
      chapter = Number(n1);
      lastHadVerse = true;
      if (n4 !== undefined) ref = `${book}.${n1}.${n2}-${book}.${n3}.${n4}`;
      else if (n3 !== undefined)
        ref = `${book}.${n1}.${n2}-${book}.${n1}.${n3}`;
      else ref = `${book}.${n1}.${n2}`;
    }

    if (!isPassageRef(ref))
      throw new Error(`Not a valid passage: "${part}" (${ref})`);
    out.push(ref);
  }
  return out;
}
