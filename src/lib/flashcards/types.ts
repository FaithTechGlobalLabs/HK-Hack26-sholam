import { z } from "zod";
import { isVerseId } from "@/lib/bible/refs";

export const CATEGORIES = [
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

export const TONES = ["fun", "fact", "deep"] as const;

export const flashcardDraftSchema = z.strictObject({
  question: z.string().min(8).max(240),
  answer: z.string().min(1).max(400),
  explanation: z.string().max(1200).optional(),
  refs: z
    .array(
      z
        .string()
        .refine(
          (id): boolean => isVerseId(id),
          "Expected a verse id like JHN.3.16",
        ),
    )
    .min(1)
    .max(8)
    .describe("Supporting verses as BOOK.chapter.verse ids, e.g. JHN.11.35"),
  category: z.enum(CATEGORIES),
  tone: z.enum(TONES),
  difficulty: z.number().int().min(1).max(3).default(1),
});

export type FlashcardDraft = z.infer<typeof flashcardDraftSchema>;
export type FlashcardCategory = (typeof CATEGORIES)[number];

export interface Flashcard extends FlashcardDraft {
  id: string;
  /** null for seed cards */
  authorId: string | null;
  status: "published" | "flagged" | "hidden";
  createdAt: string;
}

export type FlashcardSummary = Pick<
  Flashcard,
  "id" | "question" | "answer" | "refs" | "category" | "tone"
>;

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
};
