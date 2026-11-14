/**
 * Verse text from a USJ (Unified Scripture JSON) book, as published in the
 * BSB release (BSB-publishing/bsb2usfm). Chapters and verses are milestones;
 * text after a verse milestone belongs to that verse until the next one.
 * Footnotes, cross-references and headings are not verse text.
 *
 * Source quirks handled (BSB v5.19):
 * - Psalm superscriptions (`d` before the first body paragraph) are headings
 *   in English Bibles, even though the v1 milestone sits inside them.
 *   A `d` later in the chapter (Hab 3:19's closing note) stays verse text.
 * - The space between two words is sometimes lost where a footnote sits
 *   between them ("Blessed<note>are", "Samuel,<note>saying"); it is put back.
 * - The last verse of a chapter whose quotation continues into the next
 *   chapter carries two stray closing marks ("his.’’"; 59 verses). They are
 *   removed, matching the helloao.org BSB text.
 * - Em dashes are closed (no spaces), as in the printed BSB.
 * - Two source typos join punctuation to the next word ("sons:This",
 *   "LORD,which"); a space is added after , ; : ! ? before a letter.
 */

export interface UsjNode {
  type?: string;
  marker?: string;
  number?: string;
  code?: string;
  content?: (UsjNode | string)[];
}

export interface ExtractedVerse {
  chapter: number;
  verse: number;
  text: string;
}

/** Paragraph markers whose text is never part of a verse. */
const SKIP_PARAS = new Set([
  "h",
  "toc1",
  "toc2",
  "toc3",
  "mt1",
  "mt2",
  "s1",
  "s2",
  "s3",
  "r",
  "ms",
  "mr",
  "qa",
  "sp",
  "cl",
]);
/** Inline nodes dropped entirely. */
const SKIP_NODES = new Set(["note", "ref"]);
/** Marks where a footnote was removed, so a lost word space can be restored. */
const NOTE_GAP = "\u0000";

interface Acc extends ExtractedVerse {
  parts: string[];
}

export function extractVerses(book: UsjNode): ExtractedVerse[] {
  const out = new Map<string, Acc>();
  let chapter = 0;
  let current: Acc | null = null;
  let bodySeen = false;
  let muted = 0;

  const push = (text: string) => {
    if (current && muted === 0) current.parts.push(text);
  };

  const visit = (node: UsjNode | string) => {
    if (typeof node === "string") return push(node);
    const { type, marker } = node;
    if (type === "chapter") {
      chapter = Number(node.number);
      current = null;
      bodySeen = false;
      return;
    }
    if (type === "verse") {
      const verse = Number(node.number);
      const key = `${chapter}.${verse}`;
      current = out.get(key) ?? { chapter, verse, text: "", parts: [] };
      out.set(key, current);
      return;
    }
    if (type && SKIP_NODES.has(type)) {
      if (type === "note") push(NOTE_GAP);
      return;
    }
    if (type === "para" && marker && SKIP_PARAS.has(marker)) return;

    const superscription = type === "para" && marker === "d" && !bodySeen;
    if (type === "para" && marker !== "d" && marker !== "b") bodySeen = true;
    if (superscription) muted++;
    if (type === "para") push(" ");
    for (const child of node.content ?? []) visit(child);
    if (type === "para") push(" ");
    if (superscription) muted--;
  };

  for (const child of book.content ?? []) visit(child);

  return [...out.values()]
    .map(({ chapter, verse, parts }) => ({
      chapter,
      verse,
      text: normalize(parts.join("")),
    }))
    .filter((v) => v.text.length > 0);
}

function normalize(text: string): string {
  return text
    .replace(
      new RegExp(`([\\p{L}\\p{N},;:.!?”’)])${NOTE_GAP}+(\\p{L})`, "gu"),
      "$1 $2",
    )
    .replaceAll(NOTE_GAP, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?’”)])/g, "$1")
    .replace(/([“‘(])\s+/g, "$1")
    .replace(/\s*—\s*/g, "—")
    .replace(/([,;:!?])(\p{L})/gu, "$1 $2")
    .trim()
    .replace(/’’$/, "");
}

export function bookCodeOf(book: UsjNode): string | undefined {
  const id = book.content?.find(
    (n): n is UsjNode => typeof n !== "string" && n.type === "book",
  );
  return id?.code;
}
