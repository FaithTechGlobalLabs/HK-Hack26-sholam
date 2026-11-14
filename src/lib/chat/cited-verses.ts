import type { VerseRecord } from "@/lib/agent/events";
import {
  parsePassageRef,
  parseReference,
  passageToVerseRanges,
} from "@/lib/bible/refs";

/** Longest run of verses shown for one citation (a whole chapter is cut here). */
const MAX_VERSES = 40;

/**
 * The fetched verses behind one inline citation. Links name their first
 * verse (`verse:JHN.1.1`) while the label can name a range ("John 1:1–3"),
 * so the label decides how far the range runs. Only verses a tool returned
 * this turn are included; if the label cannot be read, the linked verse
 * alone is used.
 */
export function citedVerses(
  firstId: string,
  label: string,
  fetched: Record<string, VerseRecord>,
): VerseRecord[] {
  const out: VerseRecord[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    const v = fetched[id];
    if (v && !seen.has(id)) {
      seen.add(id);
      out.push(v);
    }
  };

  let refs: string[] = [];
  try {
    refs = parseReference(label);
  } catch {
    refs = [];
  }
  for (const ref of refs) {
    const passage = parsePassageRef(ref);
    if (!passage) continue;
    for (const range of passageToVerseRanges(passage)) {
      for (let v = range.verseStart; v <= range.verseEnd; v++) {
        const id = `${range.book}.${range.chapter}.${v}`;
        // Whole chapters: stop at the first verse that was not fetched.
        if (!fetched[id] && v > range.verseStart) break;
        add(id);
        if (out.length >= MAX_VERSES) return out;
      }
    }
  }
  // The label did not cover the linked verse (or could not be read).
  if (!seen.has(firstId)) {
    add(firstId);
  }
  return out;
}

/** Verse number shown before each line of a cited range. */
export function verseNumber(id: string): string {
  return id.split(".").at(-1) ?? "";
}
