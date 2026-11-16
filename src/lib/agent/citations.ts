/**
 * Citation contract: the model writes verse citations as markdown links with
 * a `verse:` URL, e.g. `[John 3:16](verse:JHN.3.16)`. A citation is verified
 * only if a tool returned that verse during the same turn, before the answer
 * was written, and any words quoted for it match the returned text. Nothing
 * fetched after the answer counts. The UI renders verified citations as chips
 * and marks the rest as unverified.
 *
 * Plain references the model wrote without a link ("(Jonah 3:1–10)") are
 * linked by the server in the text shown (`finalizeAnswer`); the model's own
 * text is kept unchanged for its history.
 */

import { findBook } from "@/lib/bible/books";
import {
  parsePassageRef,
  parseReference,
  parseVerseId,
} from "@/lib/bible/refs";
import { LIMITS } from "./limits";

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
  return inspectAnswer(markdown, seen, false);
}

/**
 * `strict` (final display check only, never the rewrite trigger): every
 * reference next to a quote must match it on its own, using only the text
 * of the verses its label names (no neighbouring verse).
 */
function inspectAnswer(
  markdown: string,
  seen: ReadonlyMap<string, { text: string }>,
  strict: boolean,
): AnswerCheck {
  const text = blankCode(markdown);
  const links = linkRefs(text);
  const refs = [...links, ...plainRefs(text, links)].sort(
    (a, b) => a.start - b.start,
  );
  const quotes = findQuotes(text);

  const mismatched = new Set<string>();
  const quoteIssues: QuoteIssue[] = [];
  const flag = (quote: Quote, ref: Ref) => {
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
  };
  for (const quote of quotes) {
    const candidates = refsForQuote(quote, refs, text);
    if (!candidates.length) continue;
    if (strict) {
      for (const ref of candidates)
        if (!quoteMatchesOwnVerses(quote.text, ref, seen)) flag(quote, ref);
      continue;
    }
    // Fine if the words match the fetched text of either neighbouring reference.
    const matched = candidates.some(
      (r) =>
        seen.has(r.verseId) && quoteMatches(quote.text, rangeText(r, seen)),
    );
    if (!matched) flag(quote, candidates[0]);
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

/** A plain reference the server linked in the shown text. */
export interface AddedLink {
  /** The link target: the first verse of the label. */
  verseId: string;
  /** The reference as the model wrote it, e.g. `Jonah 1:1–3, 17`. */
  label: string;
  /** Every verse the label names, in order. */
  verses: string[];
}

/**
 * The final answer for display and its citation check.
 *
 * - Quotes are paired with references on the RAW text (`checkAnswer`), so
 *   linking cannot change which reference a quote belongs to.
 * - Plain references in supported syntax become `[label](verse:ID)` links in
 *   the returned `text` only; the caller keeps `raw` for the model history.
 * - Every link in the returned text, the model's and the server's alike, is
 *   verified only if every verse its label names is in `seen`
 *   (`labelCoverage`); otherwise it is listed `not_fetched` on its link id.
 *   A label whose verses cannot all be listed (cross-chapter, chapter-only,
 *   too long, malformed) is never verified.
 * - Quoted words are checked three ways and every failure counts: the
 *   lenient raw check (`checkAnswer`, as the rewrite trigger saw it), and a
 *   strict check of both the raw and the linked text, where each reference
 *   next to a quote must match it with only its own verses. Linking can
 *   therefore add a failure (a link pairs where a plain reference did not)
 *   but never remove one. Failures are listed per verse id, `quote_mismatch`
 *   winning over `not_fetched`.
 *
 * `seen` must hold only verses fetched before `raw` was written. Nothing is
 * fetched here. `raw` is the authoritative input: calling this again on the
 * returned text gives the same text and the same coverage verdicts, but a
 * plain reference's quote pairing is only known from the raw text.
 */
export function finalizeAnswer(
  raw: string,
  seen: ReadonlyMap<string, { text: string }>,
): { text: string; check: AnswerCheck } {
  const base = checkAnswer(raw, seen);
  const { text } = linkPlainRefs(raw);
  const citations = extractCitations(text);

  const quoteIssues: QuoteIssue[] = [];
  const keys = new Set<string>();
  for (const q of [
    ...base.quoteIssues,
    ...inspectAnswer(raw, seen, true).quoteIssues,
    ...inspectAnswer(text, seen, true).quoteIssues,
  ]) {
    const key = [q.quote, q.verseId, q.linked, q.reason].join("\u0000");
    if (keys.has(key)) continue;
    keys.add(key);
    quoteIssues.push(q);
  }
  const quoteFailure = new Map<string, IssueReason>();
  for (const q of quoteIssues)
    quoteFailure.set(q.verseId, worse(quoteFailure.get(q.verseId), q.reason));

  const issues = new Map<string, CitationIssue>();
  const add = (verseId: string, label: string, reason: IssueReason) => {
    const prior = issues.get(verseId);
    issues.set(
      verseId,
      prior
        ? { ...prior, reason: worse(prior.reason, reason) }
        : { verseId, label, reason },
    );
  };
  for (const issue of base.unverified)
    add(issue.verseId, issue.label, issue.reason);
  for (const c of citations) {
    const needed = coveredVerses(c.label, c.verseId);
    const covered = needed?.every((id) => seen.has(id)) ?? false;
    const quoted = quoteFailure.get(c.verseId);
    if (quoted) add(c.verseId, c.label, quoted);
    if (!covered) add(c.verseId, c.label, "not_fetched");
  }

  return {
    text,
    check: { citations, unverified: [...issues.values()], quoteIssues },
  };
}

function worse(a: IssueReason | undefined, b: IssueReason): IssueReason {
  return a === "quote_mismatch" || b === "quote_mismatch"
    ? "quote_mismatch"
    : "not_fetched";
}

/** The verses a label must have fetched to count, or null if it never can. */
function coveredVerses(label: string, verseId: string): string[] | null {
  const coverage = labelCoverage(label, verseId);
  if (coverage.kind === "verses") return coverage.ids;
  return coverage.kind === "target" ? [verseId] : null;
}

/** The quote is in the fetched text of the verses this reference names. */
function quoteMatchesOwnVerses(
  quote: string,
  ref: Ref,
  seen: ReadonlyMap<string, { text: string }>,
): boolean {
  if (!seen.has(ref.verseId)) return false;
  const ids = coveredVerses(ref.label, ref.verseId);
  if (!ids) return false;
  const own = ids
    .map((id) => seen.get(id)?.text)
    .filter((t): t is string => t !== undefined)
    .join(" ");
  return quoteMatches(quote, own);
}

/** Most verses one linked plain reference may name (one lookup's worth). */
const MAX_LINKED_VERSES = LIMITS.tools.versesPerLookup;

/**
 * Consume numbered-looking names whole, even when the canon rejects them:
 * "First John" is 1JN, while "IV John" or "First II John" must never fall
 * through to the JHN suffix. All three reference scanners use this pattern;
 * findBook remains the authority for supported names and aliases.
 */
// Fold names only: RANGE_END still distinguishes a following book from prose.
const caseFolded = (word: string) =>
  word.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
const BOOK_ORDINAL_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "trillion",
  "zeroth",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "thirtieth",
  "fortieth",
  "fiftieth",
  "sixtieth",
  "seventieth",
  "eightieth",
  "ninetieth",
  "hundredth",
  "thousandth",
  "millionth",
  "billionth",
  "trillionth",
  "nth",
]
  .map(caseFolded)
  .join("|");
const BOOK_ORDINAL = `${BOOK_ORDINAL_WORDS}|[A-Za-z]+(?:${["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "teenth", "tieth", "illionth"].map(caseFolded).join("|")})`;
const BOOK_NUMBER = String.raw`(?:(?!\d+\.\s)\d+(?:[sS][tT]|[nN][dD]|[rR][dD]|[tT][hH])?|${BOOK_ORDINAL}|[ivxlcdmIVXLCDM]+)`;
const BOOK_SEPARATOR = String.raw`[\s.*_~\x60:/–—-]+`;
const BOOK_NAME = `(?:${BOOK_NUMBER}${BOOK_SEPARATOR})*(?:${BOOK_NUMBER})?[A-Za-z]+(?: [Oo][Ff] [A-Za-z]+)?`;
const BOOK_NUMBER_TOKEN = new RegExp(`^(?:${BOOK_NUMBER})$`, "i");

function hasOmittedNumberedPrefix(text: string, start: number): boolean {
  const before = text
    .slice(Math.max(0, start - 128), start)
    .replace(/[*_~`]/g, "");
  if (/[\p{L}\p{N}][-–—][ \t  ]*$/u.test(before)) return true;
  let match = before.match(/([\p{L}\p{N}]+)[ \t  ]*$/u);
  if (match?.[1].toLowerCase() === "and") {
    match = before.slice(0, match.index).match(/([\p{L}\p{N}]+)[ \t  ]*$/u);
    if (match && /^\p{N}+$/u.test(match[1])) return false;
  }
  if (!match || /[:：.]/.test(before[(match.index ?? 0) - 1] ?? ""))
    return false;
  return BOOK_NUMBER_TOKEN.test(match[1].normalize("NFKC"));
}

/** A range end: not a chapter ("1:1–2:3"), longer, or a book ("–2 Kings"). */
const RANGE_END = String.raw`(?!\d| ?:| ?[A-Z][a-z]| ?[A-Za-z]+\.? ?\d{1,3}:)`;
/**
 * A list item after a comma: as above, and not followed by any word, since
 * "…, 10 times over" or "…, 17 and" may not name a verse.
 */
const ITEM_END = String.raw`(?!\d| ?:| ?[A-Za-z])`;
/**
 * `Book c:v`, an optional `–v` and optional `, v` / `, v–v` items in the
 * same chapter: "Jonah 1:1–3, 17". Spaces only, never a line break.
 */
const LINKABLE = new RegExp(
  String.raw`\b(${BOOK_NAME})\.? (\d{1,3}):(\d{1,3})(?! ?:|\d)` +
    String.raw`(?: ?[-–—] ?\d{1,3}${RANGE_END})?` +
    String.raw`(?:, ?\d{1,3}(?: ?[-–—] ?\d{1,3})?${ITEM_END})*`,
  "g",
);
/**
 * What may not follow a match: the reference goes on in a form this does
 * not link (cross-chapter "1:1–2:3" or "1:1, 17:3", partial verse "8:28a",
 * decimals, or a number that may not be a verse: "1:1, 10 times over",
 * "1:1, 17 and …"), so the whole reference is left as written. A following
 * book ("…, 2 Kings 14:25") is not a continuation.
 */
const CONTINUES =
  /^(?:\d|[A-Za-z]| ?[-–—] ?\d| ?[:.]\d|[,;] ?\d{1,3} ?[:.]\d|[,;] ?\d{1,3}(?: ?[-–—] ?\d{1,3})? ?[a-z])/;

/**
 * Text that must not be rewritten: links and images (label and URL), any
 * bracket span, autolinks and HTML, bare URLs, reference definitions,
 * blockquotes and quoted words. Code is already blanked.
 */
const PROTECTED = [
  /!?\[[^\]\n]*\]\([^)\n]*\)/g,
  /\[[^\]\n]*\]/g,
  /<!--[\s\S]*?(?:-->|$)/g,
  /<[^>\n]*>/g,
  /\b(?:https?:\/\/|www\.)\S+/g,
  /^[ \t]*\[[^\]\n]+\]:.*$/gm,
  /^[ \t]*>.*$/gm,
  /“[^”\n]*”/g,
  /‘[^’\n]*’/g,
  /"[^"\n]*"/g,
];

/**
 * Links plain references in supported syntax: `[label](verse:FIRST.ID)`.
 * A reference is linked whole or not at all; anything it cannot fully read
 * (unknown book, chapter-only, cross-chapter, more than MAX_LINKED_VERSES
 * verses) stays exactly as written.
 */
export function linkPlainRefs(raw: string): {
  text: string;
  added: AddedLink[];
} {
  const text = blankAllCode(raw);
  const spans: [number, number][] = findQuotes(text).map((q) => [
    q.start,
    q.end,
  ]);
  for (const re of PROTECTED)
    for (const m of text.matchAll(re))
      spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);

  const found: (AddedLink & { start: number; end: number })[] = [];
  for (const m of text.matchAll(LINKABLE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (hasOmittedNumberedPrefix(raw, start)) continue;
    // A split book name is consumed, but not linked across a line break.
    if (/[\r\n]/.test(m[1])) continue;
    if (spans.some(([s, e]) => start < e && end > s)) continue;
    if (/[[\]!\\]/.test(text[start - 1] ?? "")) continue;
    // An unclosed "[" before it would swallow the link into its label.
    const before = text.slice(0, start);
    if (before.lastIndexOf("[") > before.lastIndexOf("]")) continue;
    if (/^[\]]/.test(text.slice(end)) || CONTINUES.test(text.slice(end)))
      continue;
    const label = raw.slice(start, end);
    const verses = labelVerses(label, m[1], Number(m[2]), Number(m[3]));
    if (!verses) continue;
    found.push({ start, end, verseId: verses[0], label, verses });
  }

  let out = raw;
  for (const link of [...found].reverse())
    out = `${out.slice(0, link.start)}[${link.label}](${VERSE_PROTOCOL}${link.verseId})${out.slice(link.end)}`;
  return {
    text: out,
    added: found.map(({ verseId, label, verses }) => ({
      verseId,
      label,
      verses,
    })),
  };
}

/** Every verse a plain match names, or null if it cannot be linked whole. */
function labelVerses(
  label: string,
  bookName: string,
  chapter: number,
  verse: number,
): string[] | null {
  const book = findBook(bookName);
  if (!book) return null;
  const coverage = labelCoverage(label, `${book.code}.${chapter}.${verse}`);
  return coverage.kind === "verses" ? coverage.ids : null;
}

/**
 * What a citation label claims about its link target `verseId`:
 * - `verses`: an English reference starting at `verseId`, in one chapter,
 *   that lists every verse it names (at most MAX_LINKED_VERSES);
 * - `unsupported`: an English reference to another book or verse
 *   ("[Romans 8:28](verse:JHN.3.16)"), or one that names more than can be
 *   listed here (cross-chapter, chapter-only, too long, an unreadable tail
 *   such as "Jonah 1:1–3, 17 (BSB)"); never verified;
 * - `target`: an opaque label with no reference numbers or known book name;
 *   only the link target is judged. Unparseable specific references stay unchecked.
 */
type LabelCoverage =
  | { kind: "verses"; ids: string[] }
  | { kind: "unsupported" }
  | { kind: "target" };

function labelCoverage(label: string, verseId: string): LabelCoverage {
  const target = parseVerseId(verseId);
  if (!target) return { kind: "unsupported" };
  const readable = label.replace(/[*_~`]/g, "");
  let refs: string[];
  try {
    refs = parseReference(readable);
  } catch {
    // A specific reference must establish its whole book identity, not just
    // share chapter/verse numbers with an unrelated fetched target.
    return /\p{N}/u.test(readable) || findBook(readable)
      ? { kind: "unsupported" }
      : { kind: "target" };
  }
  // It parsed, so it names a known book: another book is never this verse.
  if (!refs.length) return { kind: "target" };
  const ids: string[] = [];
  for (const ref of refs) {
    const p = parsePassageRef(ref);
    if (
      !p ||
      p.book !== target.book ||
      p.startChapter !== target.chapter ||
      p.endChapter !== target.chapter ||
      p.startVerse === null ||
      p.endVerse === null
    )
      return { kind: "unsupported" };
    for (let v = p.startVerse; v <= p.endVerse; v++) {
      const id = `${target.book}.${target.chapter}.${v}`;
      if (!parseVerseId(id)) return { kind: "unsupported" };
      if (!ids.includes(id)) ids.push(id);
      if (ids.length > MAX_LINKED_VERSES) return { kind: "unsupported" };
    }
  }
  return ids[0] === verseId ? { kind: "verses", ids } : { kind: "unsupported" };
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

/** A fence opener, also inside list items ("1. ```", "- ~~~", "- 1. ```"). */
const FENCE_OPEN = /^\s*(?:(?:[-*+]|\d{1,9}[.)])\s+)*(`{3,}|~{3,})(.*)$/;
/** A closing fence at any indent (list items indent their fences). */
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

/**
 * Every kind of Markdown code blanked (same length), for linking only. One
 * pass, line by line, so a closing token is never mistaken for an opener:
 * - ``` and ~~~ fences at a line start, also after list markers; closed by
 *   a fence of the same character at least as long, else open to the end;
 * - lines indented four spaces or a tab (list continuations too: those are
 *   simply not linked);
 * - inline spans of any backtick run (`a`, ``a ` b``), closed by a run of
 *   the same length later in the same paragraph, across lines if need be.
 *   A mid-line ``` that closes on a later line ("Example ```\n…\n```") is
 *   blanked up to that close. An unmatched run is literal text.
 */
function blankAllCode(markdown: string): string {
  const out = markdown.split("");
  const blank = (start: number, end: number) => {
    for (let k = start; k < end; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const lineEndAt = (at: number) => {
    const eol = markdown.indexOf("\n", at);
    return eol === -1 ? markdown.length : eol;
  };

  let fence: { ch: string; len: number } | null = null;
  let pos = 0;
  while (pos < markdown.length) {
    let lineEnd = lineEndAt(pos);
    const line = markdown.slice(pos, lineEnd);
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.ch && close[1].length >= fence.len)
        fence = null;
      blank(pos, lineEnd);
      pos = lineEnd + 1;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    // A backtick fence's info string has no backticks ("```a```" is inline).
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { ch: open[1][0], len: open[1].length };
      blank(pos, lineEnd);
      pos = lineEnd + 1;
      continue;
    }
    if (/^(?: {4}|\t)/.test(line)) {
      blank(pos, lineEnd);
      pos = lineEnd + 1;
      continue;
    }
    let p = pos;
    while (p < lineEnd) {
      const tick = markdown.indexOf("`", p);
      if (tick === -1 || tick >= lineEnd) break;
      let runEnd = tick;
      while (markdown[runEnd] === "`") runEnd++;
      const close = closingRun(markdown, runEnd, runEnd - tick);
      if (close === -1) {
        p = runEnd;
        continue;
      }
      const after = close + (runEnd - tick);
      blank(tick, after);
      // The span may end on a later line: go on from there.
      if (after > lineEnd) lineEnd = lineEndAt(after);
      p = after;
    }
    pos = lineEnd + 1;
  }
  return out.join("");
}

/**
 * Start of the next run of exactly `len` backticks from `from`, before the
 * paragraph ends (a blank line), or -1.
 */
function closingRun(markdown: string, from: number, len: number): number {
  const paragraphEnd = /\n[ \t]*(?:\n|$)/g;
  paragraphEnd.lastIndex = from;
  const limit = paragraphEnd.exec(markdown)?.index ?? markdown.length;
  let at = markdown.indexOf("`", from);
  while (at !== -1 && at < limit) {
    let end = at;
    while (markdown[end] === "`") end++;
    if (end - at === len) return at;
    at = markdown.indexOf("`", end);
  }
  return -1;
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

const PLAIN_REF = new RegExp(
  String.raw`\b(${BOOK_NAME})\.? (\d{1,3}):(\d{1,3})(?:\s?[-–—]\s?(\d{1,3})(?::(\d{1,3}))?)?`,
  "g",
);

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
