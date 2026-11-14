import seed from "../../../data/letters.seed.json";

export const LETTER_TOPICS = [
  "hope",
  "anxiety",
  "loneliness",
  "grief",
  "purpose",
  "rest",
] as const;
export type LetterTopic = (typeof LETTER_TOPICS)[number];

export const LETTER_TOPIC_LABELS: Record<LetterTopic, string> = {
  hope: "Hope",
  anxiety: "Anxiety",
  loneliness: "Loneliness",
  grief: "Grief",
  purpose: "Purpose",
  rest: "Rest",
};

export interface Letter {
  id: string;
  topic: LetterTopic;
  greeting: string;
  body: string[];
  signoff: string;
}

/** Letters of encouragement. Seed data until letters are stored in the DB. */
export const LETTERS = seed as Letter[];
