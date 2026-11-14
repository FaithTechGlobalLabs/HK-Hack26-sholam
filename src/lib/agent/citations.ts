/**
 * Citation contract: the model writes verse citations as markdown links with
 * a `verse:` URL, e.g. `[John 3:16](verse:JHN.3.16)`. A citation is verified
 * only if a tool returned that verse during the same turn, before the answer
 * was written, and any words quoted for it match the returned text. Nothing
 * fetched after the answer counts. The UI renders verified citations as chips
 * and marks the rest as unverified.
 */

import { findBook } from "@/lib/bible/books";
import {
  parsePassageRef,
  parseReference,
  parseVerseId,
} from "@/lib/bible/refs";

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

export type IssueReason = "not_fetched" | "quote_mismatch";

export interface CitationIssue {
  verseId: string;
  label: string;
  reason: IssueReason;
}

export interface QuoteIssue {
  quote: string;
  verseId: string;
  label: string;
  reason: IssueReason;
  /** true for a `verse:` link, false for a plain "(Romans 8:28)" reference. */
  linked: boolean;
}

export interface AnswerCheck {
  citations: Citation[];
  /** `verse:` links that must not show as verified, one per verse id. */
  unverified: CitationIssue[];
  /** Quoted Scripture that no tool returned this turn, or that differs from it. */
  quoteIssues: QuoteIssue[];
}

interface Ref {
  start: number;
  end: number;
  verseId: string;
  label: string;
  linked: boolean;
  book: string;
  /** chapter * 1000 + verse */
  from: number;
  to: number;
}

interface Quote {
  start: number;
  end: number;
  text: string;
}

/** How far (in characters) a reference may sit from the quote it labels. */
const NEAR = 40;

/**
 * Checks a finished answer against the verses tools returned this turn.
 * `seen` must hold only verses fetched before the answer was written.
 */
export function checkAnswer(
  markdown: string,
  seen: ReadonlyMap<string, { text: string }>,
): AnswerCheck {
  const text = blankCode(markdown);
  const links = linkRefs(text);
  const refs = [...links, ...plainRefs(text, links)].sort(
    (a, b) => a.start - b.start,
  );
  const quotes = findQuotes(text);

  const mismatched = new Set<string>();
  const quoteIssues: QuoteIssue[] = [];
  for (const quote of quotes) {
    const candidates = refsForQuote(quote, refs, text);
    if (!candidates.length) continue;
    // Fine if the words match the fetched text of either neighbouring reference.
    const matched = candidates.some(
      (r) =>
        seen.has(r.verseId) && quoteMatches(quote.text, rangeText(r, seen)),
    );
    if (matched) continue;
    const ref = candidates[0];
    const fetched = seen.has(ref.verseId);
    const reason: IssueReason = fetched ? "quote_mismatch" : "not_fetched";
    if (reason === "quote_mismatch" && ref.linked) mismatched.add(ref.verseId);
    quoteIssues.push({
      quote: quote.text,
      verseId: ref.verseId,
      label: ref.label,
      reason,
      linked: ref.linked,
    });
  }

  const unverified: CitationIssue[] = [];
  const listed = new Set<string>();
  for (const ref of links) {
    if (listed.has(ref.verseId)) continue;
    let reason: IssueReason | null = null;
    if (!seen.has(ref.verseId)) reason = "not_fetched";
    else if (mismatched.has(ref.verseId)) reason = "quote_mismatch";
    if (!reason) continue;
    listed.add(ref.verseId);
    unverified.push({ verseId: ref.verseId, label: ref.label, reason });
  }

  return { citations: extractCitations(markdown), unverified, quoteIssues };
}

/** Lower-case words only, so punctuation and curly quotes don't matter. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Every part of the quote (split at "…" and [brackets]) appears in the verse text. */
export function quoteMatches(quote: string, verseText: string): boolean {
  const corpus = ` ${normalizeForMatch(verseText)} `;
  const parts = quote
    .split(/…|\.\s?\.\s?\.|\[[^\]]*\]/)
    .map(normalizeForMatch)
    .filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => corpus.includes(` ${part} `));
}

function blankCode(markdown: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

function order(chapter: number, verse: number) {
  return chapter * 1000 + verse;
}

function linkRefs(text: string): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(CITATION)) {
    const id = parseVerseId(m[2]);
    if (!id) continue;
    const from = order(id.chapter, id.verse);
    let to = from;
    // The label may name a range: [John 9:1-3](verse:JHN.9.1).
    try {
      const passage = parsePassageRef(parseReference(m[1])[0] ?? "");
      if (
        passage &&
        passage.book === id.book &&
        order(passage.startChapter, passage.startVerse ?? 1) === from
      )
        to = order(passage.endChapter, passage.endVerse ?? 999);
    } catch {
      // Non-English or free-form label: the link target alone.
    }
    out.push({
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      verseId: m[2],
      label: m[1],
      linked: true,
      book: id.book,
      from,
      to,
    });
  }
  return out;
}

const PLAIN_REF =
  /\b((?:[1-3]\s?)?[A-Z][a-z]+(?: of [A-Z][a-z]+)?)\.? (\d{1,3}):(\d{1,3})(?:\s?[-–—]\s?(\d{1,3})(?::(\d{1,3}))?)?/g;

function plainRefs(text: string, links: Ref[]): Ref[] {
  const out: Ref[] = [];
  for (const m of text.matchAll(PLAIN_REF)) {
    const start = m.index ?? 0;
    if (links.some((l) => start >= l.start && start < l.end)) continue;
    const book = findBook(m[1]);
    if (!book) continue;
    const chapter = Number(m[2]);
    const verse = Number(m[3]);
    const verseId = `${book.code}.${chapter}.${verse}`;
    if (!parseVerseId(verseId)) continue;
    const endChapter = m[5] ? Number(m[4]) : chapter;
    const endVerse = m[5] ? Number(m[5]) : m[4] ? Number(m[4]) : verse;
    out.push({
      start,
      end: start + m[0].length,
      verseId,
      label: m[0],
      linked: false,
      book: book.code,
      from: order(chapter, verse),
      to: Math.max(order(endChapter, endVerse), order(chapter, verse)),
    });
  }
  return out;
}

function findQuotes(text: string): Quote[] {
  const out: Quote[] = [];
  const add = (start: number, end: number, inner: string) => {
    const latin = (inner.match(/[A-Za-z]/g) ?? []).length;
    const visible = inner.replace(/\s/g, "").length;
    const words = normalizeForMatch(inner).split(" ").filter(Boolean);
    if (words.length < 2 || latin < 8 || latin / visible < 0.6) return;
    if (out.some((q) => start < q.end && end > q.start)) return;
    out.push({ start, end, text: inner.trim() });
  };
  for (const m of text.matchAll(/“([^”\n]{2,800})”/g))
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, m[1]);
  for (const m of text.matchAll(/"([^"\n]{2,800})"/g))
    add(m.index ?? 0, (m.index ?? 0) + m[0].length, m[1]);
  for (const m of text.matchAll(/(?:^|\n)((?:>[^\n]*(?:\n|$))+)/g)) {
    const block = m[1];
    const start = (m.index ?? 0) + m[0].indexOf(block);
    const inner = block
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join(" ")
      .replace(/^[“"]|[”"]$/g, "");
    add(
      start,
      start + block.length,
      inner.replace(/\[([^\]]+)\]\(verse:[^)]+\)/g, ""),
    );
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The references that may label a quote, most likely first: one right after
 * it (`"…" [John 3:16](verse:…)`, or a plain `"…" (Romans 8:28)` /
 * `"…" — Romans 8:28`), then one right before it in the same sentence
 * (`John 3:16 says, "…"`, `Mark 16:16 ("…")`). A plain reference that just
 * follows (`"…" 1 Peter 3:21 says`) starts the next sentence, and one after
 * a closing bracket (`("…"), Acts 2:38`) starts the next list item.
 */
function refsForQuote(quote: Quote, refs: Ref[], text: string): Ref[] {
  const out: Ref[] = [];
  const after = refs.find((r) => {
    if (r.start < quote.end || r.start - quote.end > NEAR) return false;
    const gap = text.slice(quote.end, r.start);
    return r.linked
      ? /^[\s*_,.;:!?]*$/.test(gap)
      : /^[\s*_,.;:!?]*[([—–-]\s*$/.test(gap);
  });
  if (after) out.push(after);
  const before = [...refs]
    .reverse()
    .find(
      (r) =>
        r.end <= quote.start &&
        quote.start - r.end <= NEAR &&
        !/[.!?]\s|\n/.test(text.slice(r.end, quote.start)),
    );
  if (before) out.push(before);
  return out;
}

/** Text of the fetched verses in the cited range, allowing one verse either side. */
function rangeText(
  ref: Ref,
  seen: ReadonlyMap<string, { text: string }>,
): string {
  const parts: { at: number; text: string }[] = [];
  for (const [id, verse] of seen) {
    const p = parseVerseId(id);
    if (!p || p.book !== ref.book) continue;
    const at = order(p.chapter, p.verse);
    if (at >= ref.from - 1 && at <= ref.to + 1)
      parts.push({ at, text: verse.text });
  }
  return parts
    .sort((a, b) => a.at - b.at)
    .map((p) => p.text)
    .join(" ");
}
