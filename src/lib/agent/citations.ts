/**
 * Citation contract: the model writes verse citations as markdown links with
 * a `verse:` URL, e.g. `[John 3:16](verse:JHN.3.16)`. A citation is verified
 * only if a tool returned that verse during the same turn. The UI renders
 * verified citations as chips and marks the rest as unverified.
 */

export interface Citation {
  label: string;
  verseId: string;
}

const CITATION = /\[([^\]]+)\]\(verse:([1-3]?[A-Z]{2,3}\.\d{1,3}\.\d{1,3})\)/g;

export function extractCitations(markdown: string): Citation[] {
  return Array.from(markdown.matchAll(CITATION), (m) => ({
    label: m[1],
    verseId: m[2],
  }));
}

export function classifyCitations(
  citations: Citation[],
  seenVerseIds: ReadonlySet<string>,
): { verified: Citation[]; unverified: Citation[] } {
  const verified: Citation[] = [];
  const unverified: Citation[] = [];
  for (const c of citations)
    (seenVerseIds.has(c.verseId) ? verified : unverified).push(c);
  return { verified, unverified };
}

export const VERSE_PROTOCOL = "verse:";
