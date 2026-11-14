/**
 * Shared tokenizer for Bible search and flashcard ranking.
 * Kept free of server-only imports so client or test code can reuse it.
 */

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "by",
  "with",
  "from",
  "that",
  "this",
  "it",
  "as",
  "at",
  "he",
  "she",
  "they",
  "his",
  "her",
  "their",
  "you",
  "your",
  "i",
  "we",
  "not",
  "but",
  "did",
  "does",
  "do",
  "what",
  "why",
  "how",
  "who",
  "when",
  "where",
  "about",
  "really",
  "bible",
]);

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}
