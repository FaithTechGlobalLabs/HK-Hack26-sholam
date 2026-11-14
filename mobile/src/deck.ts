import discoverSeed from "../assets/deck/faithmap.cards.json";
import factSeed from "../assets/deck/flashcards.seed.json";
import type { Flashcard } from "./types";

interface FactSeed {
  id: string;
  question: string;
  answer: string;
  explanation?: string;
  refs: string[];
  category: string;
}

interface DiscoverSeed {
  id: string;
  question: string;
  answer?: string;
  explanation?: string;
  takeaway?: string;
  refs: string[];
  category: string;
  tags?: string[];
  minutes?: number;
  section?: string;
}

function asFacts(value: unknown): FactSeed[] {
  return Array.isArray(value) ? (value as FactSeed[]) : [];
}

function asDiscover(value: unknown): DiscoverSeed[] {
  return Array.isArray(value) ? (value as DiscoverSeed[]) : [];
}

/** The same seed deck the website uses when Postgres is not connected. */
export function bundledDeck(): Flashcard[] {
  const facts: Flashcard[] = asFacts(factSeed).map((card) => ({
    id: card.id,
    kind: "fact",
    question: card.question,
    answer: card.answer,
    explanation: card.explanation,
    refs: card.refs,
    category: card.category,
  }));
  const discover: Flashcard[] = asDiscover(discoverSeed).map((card) => ({
    id: card.id,
    kind: "discover",
    question: card.question,
    answer: card.answer,
    explanation: card.explanation,
    takeaway: card.takeaway,
    refs: card.refs,
    category: card.category,
    tags: card.tags,
    minutes: card.minutes,
    section: card.section,
  }));
  return [...facts, ...discover];
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = next[i];
    next[i] = next[j] as T;
    next[j] = swap as T;
  }
  return next;
}
