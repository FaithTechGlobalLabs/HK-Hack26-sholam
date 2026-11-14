import { z } from "zod";
import type { VerseRecord } from "@/lib/agent/events";
import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";

/**
 * The shape of `messages.content` (jsonb) for signed-in chats. One row per
 * turn side: a `user` row, then an `assistant` row. Rows are append-only
 * (AGENTS.md rule 7): written once, never edited or reordered.
 *
 * User row: what the person typed. The personalization note the server
 * appends before calling the model is rebuilt each turn and not stored.
 *
 * Assistant row: the OpenRouter turn as it happened.
 * - `turn` holds the OpenAI-format messages the model produced this turn,
 *   verbatim and in order: an assistant message with `tool_calls`, the
 *   `tool` results, then the final assistant message. Reasoning is
 *   excluded by the request today; if a provider returns `reasoning` or
 *   `reasoning_details`, they stay on those messages as returned.
 * - `text` is the answer the person saw (the streamed text).
 * - `verses` are the verse records tools returned this turn: the only
 *   verses this answer may cite (AGENTS.md rule 1). Reloading a chat
 *   renders citations against these, never against new lookups.
 * - `source: "tab-import"` marks answers copied from a signed-out tab's
 *   history on first sign-in. They carry text only (`turn` empty, no
 *   verses), so their citations show as unverified.
 */

export const STORED_CONTENT_VERSION = 1;

const verseRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  translation: z.string(),
});

export const storedUserContentSchema = z.object({
  v: z.literal(STORED_CONTENT_VERSION),
  text: z.string(),
});

export const storedAssistantContentSchema = z.object({
  v: z.literal(STORED_CONTENT_VERSION),
  source: z.enum(["openrouter", "demo", "tab-import"]),
  model: z.string().optional(),
  turn: z.array(z.unknown()),
  text: z.string(),
  verses: z.array(verseRecordSchema),
  cards: z.array(z.unknown()).optional(),
  proposal: z.unknown().optional(),
  stopReason: z.string().optional(),
  error: z.string().optional(),
});

export type StoredUserContent = z.infer<typeof storedUserContentSchema>;
export type StoredAssistantContent = z.infer<
  typeof storedAssistantContentSchema
>;

export type StoredMessageInput =
  | { role: "user"; content: StoredUserContent }
  | { role: "assistant"; content: StoredAssistantContent };

export function userContent(text: string): StoredUserContent {
  return { v: STORED_CONTENT_VERSION, text };
}

export function importedAssistantContent(text: string): StoredAssistantContent {
  return {
    v: STORED_CONTENT_VERSION,
    source: "tab-import",
    turn: [],
    text,
    verses: [],
  };
}

/** A stored message ready for the chat view. */
export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Verses fetched in that turn, by id (drives verse chips). */
  verses: Record<string, VerseRecord>;
  cards: FlashcardSummary[];
  proposal?: FlashcardDraft;
  error?: string;
}

export interface StoredRow {
  seq: number;
  role: "user" | "assistant";
  content: unknown;
}

/**
 * Rows → messages for display. A row that does not parse (an older shape)
 * is skipped rather than breaking the whole chat.
 */
export function toChatMessages(
  chatId: string,
  rows: StoredRow[],
): StoredChatMessage[] {
  const out: StoredChatMessage[] = [];
  for (const row of rows) {
    const id = `${chatId}:${row.seq}`;
    if (row.role === "user") {
      const parsed = storedUserContentSchema.safeParse(row.content);
      if (parsed.success)
        out.push({
          id,
          role: "user",
          text: parsed.data.text,
          verses: {},
          cards: [],
        });
      continue;
    }
    const parsed = storedAssistantContentSchema.safeParse(row.content);
    if (!parsed.success) continue;
    const c = parsed.data;
    out.push({
      id,
      role: "assistant",
      text: c.text,
      verses: Object.fromEntries(c.verses.map((v) => [v.id, v])),
      cards: (c.cards ?? []) as FlashcardSummary[],
      proposal: c.proposal as FlashcardDraft | undefined,
      error: c.error,
    });
  }
  return out;
}

/** Text turns for the model's history (what the browser sends today). */
export function toHistoryTurns(
  messages: StoredChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, content: m.text }));
}
