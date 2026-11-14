import { z } from "zod";
import { isPassageRef, isVerseId } from "@/lib/bible/refs";

/**
 * Two kinds of card share the public deck:
 * - fact: a question with an answer, backed by specific verses (seed deck,
 *   agent proposals, the "New card" form).
 * - discover: an open question with Scripture passages, explored in chat
 *   (the FaithMap set). It may carry the team's written answer, an
 *   explanation of the passage and a one-line takeaway, taken from the
 *   source file as written; nothing generates them.
 */
export const KINDS = ["fact", "discover"] as const;
export type CardKind = (typeof KINDS)[number];

export const FACT_CATEGORIES = [
  "jesus",
  "god",
  "old-testament",
  "new-testament",
  "people",
  "places",
  "miracles",
  "numbers",
  "fun-facts",
] as const;

/** FaithMap sections, in the order of the source document. */
export const DISCOVER_CATEGORIES = [
  "life-identity",
  "jesus-details",
  "surprising-stories",
  "jesus-times",
  "big-questions",
  "modern-world",
  "science-history",
  "prayer-purpose",
  "wait-really",
] as const;

export const CATEGORIES = [...FACT_CATEGORIES, ...DISCOVER_CATEGORIES] as const;

export const TONES = ["fun", "fact", "deep"] as const;

const verseIdSchema = z
  .string()
  .refine((id): boolean => isVerseId(id), "Expected a verse id like JHN.3.16");
const passageRefSchema = z
  .string()
  .refine(
    (ref): boolean => isPassageRef(ref),
    "Expected a passage like MAT.18.21-MAT.18.35 or DAN.4",
  );

/** A fact card as the agent proposes it or a user writes it. */
export const flashcardDraftSchema = z.strictObject({
  question: z.string().min(8).max(240),
  answer: z.string().min(1).max(400),
  explanation: z.string().max(1200).optional(),
  refs: z
    .array(verseIdSchema)
    .min(1)
    .max(8)
    .describe("Supporting verses as BOOK.chapter.verse ids, e.g. JHN.11.35"),
  category: z.enum(FACT_CATEGORIES),
  tone: z.enum(TONES),
  difficulty: z.number().int().min(1).max(3).default(1),
});

/** A discover card as stored in a seed file (data/faithmap.cards.json). */
export const discoverCardSchema = z.strictObject({
  kind: z.literal("discover"),
  question: z.string().min(8).max(240),
  refs: z.array(passageRefSchema).min(1).max(12),
  category: z.enum(DISCOVER_CATEGORIES),
  section: z.string().min(1).max(160),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  minutes: z.number().int().min(1).max(30).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  source: z.string().max(80),
  /** The team's written answer ("Clear answer" in the source). */
  answer: z.string().min(1).max(600).optional(),
  /** Why the passage matters, in context. */
  explanation: z.string().min(1).max(900).optional(),
  /** One line to remember. */
  takeaway: z.string().min(1).max(240).optional(),
});

export type FlashcardDraft = z.infer<typeof flashcardDraftSchema>;
export type DiscoverCardSeed = z.infer<typeof discoverCardSchema>;
export type FlashcardCategory = (typeof CATEGORIES)[number];

interface CardMeta {
  id: string;
  /** null for seed cards */
  authorId: string | null;
  status: "published" | "flagged" | "hidden";
  createdAt: string;
}

export interface FactCard extends FlashcardDraft, CardMeta {
  kind: "fact";
}

export interface DiscoverCard extends Omit<DiscoverCardSeed, "kind">, CardMeta {
  kind: "discover";
}

export type Flashcard = FactCard | DiscoverCard;

/** What search results and UI events carry about a card. */
export type FlashcardSummary = {
  id: string;
  kind: CardKind;
  question: string;
  /** fact cards, and discover cards that carry the team's answer */
  answer?: string;
  refs: string[];
  category: FlashcardCategory;
};

export const CATEGORY_LABELS: Record<FlashcardCategory, string> = {
  jesus: "Jesus",
  god: "God",
  "old-testament": "Old Testament",
  "new-testament": "New Testament",
  people: "People",
  places: "Places",
  miracles: "Miracles",
  numbers: "Numbers",
  "fun-facts": "Fun facts",
  "life-identity": "Everyday life & identity",
  "jesus-details": "Jesus: the unexpected details",
  "surprising-stories": "Strange & surprising stories",
  "jesus-times": "Life in Jesus' time",
  "big-questions": "Big questions",
  "modern-world": "Faith & the modern world",
  "science-history": "Science, history & the Bible",
  "prayer-purpose": "Prayer & purpose",
  "wait-really": "Wait, that's in the Bible?",
};

export const KIND_LABELS: Record<CardKind, string> = {
  fact: "Quick facts",
  discover: "Discover",
};
