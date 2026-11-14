const BOOKS: Record<string, string> = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Songs",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

function pointLabel(point: string): {
  book: string;
  name: string;
  chapter: string;
  verse?: string;
} | null {
  const match = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3}))?$/.exec(point);
  if (!match) return null;
  return {
    book: match[1],
    name: BOOKS[match[1]] ?? match[1],
    chapter: match[2],
    verse: match[3],
  };
}

/** `JHN.3.16` or `MAT.18.21-MAT.18.35` to a readable label. */
export function passageLabel(ref: string): string {
  const [startRef, endRef] = ref.split("-");
  const start = pointLabel(startRef ?? "");
  if (!start) return ref;
  const left = start.verse
    ? `${start.name} ${start.chapter}:${start.verse}`
    : `${start.name} ${start.chapter}`;
  if (!endRef) return left;
  const end = pointLabel(endRef);
  if (!end) return left;
  if (start.book === end.book && start.chapter === end.chapter && end.verse) {
    return `${left}–${end.verse}`;
  }
  const right = end.verse
    ? `${end.name} ${end.chapter}:${end.verse}`
    : `${end.name} ${end.chapter}`;
  return `${left}–${right}`;
}

export type Span =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "verse"; label: string; id: string };

export type Block =
  | { kind: "p"; spans: Span[] }
  | { kind: "li"; spans: Span[] };

const VERSE = /\[([^\]]+)\]\(verse:([1-3]?[A-Z]{2,3}\.\d{1,3}\.\d{1,3})\)/g;

function textSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      spans.push({ kind: "strong", text: part.slice(2, -2) });
    } else {
      spans.push({ kind: "text", text: part });
    }
  }
  return spans;
}

function inline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(VERSE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push(...textSpans(text.slice(last, index)));
    spans.push({ kind: "verse", label: match[1] ?? "", id: match[2] ?? "" });
    last = index + match[0].length;
  }
  if (last < text.length) spans.push(...textSpans(text.slice(last)));
  return spans.length ? spans : [{ kind: "text", text: "" }];
}

/** Enough of the guide's markdown for paragraphs, lists, bold, and verse links. */
export function blocksOf(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of markdown.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    if (!lines.length) continue;
    const list = lines.every((line) => /^(\s*[-*]|\s*\d+\.)\s+/.test(line));
    if (list) {
      for (const line of lines) {
        blocks.push({
          kind: "li",
          spans: inline(line.replace(/^(\s*[-*]|\s*\d+\.)\s+/, "")),
        });
      }
    } else {
      blocks.push({ kind: "p", spans: inline(lines.join(" ")) });
    }
  }
  return blocks;
}
