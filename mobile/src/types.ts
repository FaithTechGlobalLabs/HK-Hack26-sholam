export type PlanId = "free" | "plus";
export type BillingInterval = "month" | "year";
export type Tab = "chat" | "cards" | "chats" | "account";

export interface UsageSnapshot {
  plan: PlanId;
  status: string;
  questionsUsed: number;
  questionsLimit: number;
  savedChatLimit: number;
  resetsAt: string;
  customerId: string | null;
  stripe: { ready: boolean; missing: string[] };
  supabase: "configured" | "unconfigured";
  ai: "live" | "demo";
  prices: { month: string | null; year: string | null };
}

export interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface LocalChat {
  id: string;
  title: string;
  updatedAt: string;
  messages: LocalChatMessage[];
}

export interface VerseRecord {
  id: string;
  label: string;
  text: string;
  translation: string;
}

export interface FlashcardSummary {
  id: string;
  kind: "fact" | "discover";
  question: string;
  answer?: string;
  refs: string[];
  category: string;
}

export interface FlashcardDraft {
  question: string;
  answer: string;
  explanation?: string;
  refs: string[];
  category: string;
  tone?: string;
  difficulty?: number;
}

export interface Flashcard {
  id: string;
  kind: "fact" | "discover";
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

export interface ToolStatus {
  id: string;
  name: string;
  done: boolean;
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  verses: Record<string, VerseRecord>;
  tools: ToolStatus[];
  cards: FlashcardSummary[];
  proposal?: FlashcardDraft;
  error?: string;
  streaming: boolean;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "reset"; text?: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_result"; id: string; name: string; summary?: string }
  | { type: "verses"; verses: VerseRecord[] }
  | { type: "flashcards"; cards: FlashcardSummary[] }
  | { type: "flashcard_proposal"; draft: FlashcardDraft }
  | { type: "error"; message: string; code?: string }
  | { type: "done" }
  | { type: "citations" };

export const CATEGORY_LABELS: Record<string, string> = {
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

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 42 ? clean : `${clean.slice(0, 40)}…`;
}

export function uid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const n = Math.floor(Math.random() * 16);
    const v = char === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
