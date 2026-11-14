import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { chats, messages } from "@/db/schema";
import { titleFromMessage } from "./local-history";
import {
  importedAssistantContent,
  type StoredChatMessage,
  type StoredMessageInput,
  toChatMessages,
  userContent,
} from "./stored-content";

/**
 * Chats and messages for signed-in people, in Postgres.
 *
 * The server connects as the database owner, so RLS does not apply here:
 * every function takes the signed-in user's id and every query that reads
 * or writes a chat filters on `chats.user_id` itself. Nothing in this file
 * updates or deletes a message (append-only, AGENTS.md rule 7).
 */

export class ChatOwnershipError extends Error {
  constructor() {
    super("Chat belongs to another account");
    this.name = "ChatOwnershipError";
  }
}

const CHAT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chat ids are UUIDs (made in the browser); anything else is never queried. */
export function isChatId(id: string): boolean {
  return CHAT_ID.test(id);
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

// ---- Queries (exported so tests can check their user scoping) ----

export function listChatsQuery(db: Db, userId: string, limit: number) {
  return db
    .select({
      id: chats.id,
      title: chats.title,
      updatedAt: chats.updatedAt,
      // Spelled out: in a one-table select Drizzle leaves column names
      // unqualified, and a bare "id" here would mean messages.id.
      messageCount: sql<number>`(select count(*)::int from "messages" m where m."chat_id" = "chats"."id")`,
    })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
}

export function ownedChatQuery(db: Db, userId: string, chatId: string) {
  return db
    .select({ id: chats.id, title: chats.title })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);
}

export function ownedMessagesQuery(db: Db, userId: string, chatId: string) {
  return db
    .select({
      seq: messages.seq,
      role: messages.role,
      content: messages.content,
    })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .where(and(eq(messages.chatId, chatId), eq(chats.userId, userId)))
    .orderBy(asc(messages.seq));
}

/** Existence only (no title, no messages): tells "someone else's" from "no such chat". */
export function chatExistsQuery(db: Db, chatId: string) {
  return db
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
}

// ---- Reads ----

export async function listChats(
  db: Db,
  userId: string,
  limit = 50,
): Promise<ChatSummary[]> {
  const rows = await listChatsQuery(db, userId, limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
    messageCount: Number(r.messageCount),
  }));
}

export type ChatLookup =
  | {
      status: "owned";
      chat: { id: string; title: string };
      messages: StoredChatMessage[];
    }
  | { status: "not-yours" }
  | { status: "missing" };

/**
 * A chat for its owner. `not-yours` (exists, another account or signed
 * out) and `missing` (never saved, e.g. a signed-out tab's chat) are told
 * apart so the page can 404 the first and fall back to tab history for the
 * second.
 */
export async function loadChat(
  db: Db,
  userId: string | null,
  chatId: string,
): Promise<ChatLookup> {
  if (!isChatId(chatId)) return { status: "missing" };
  if (userId) {
    const [chat] = await ownedChatQuery(db, userId, chatId);
    if (chat) {
      const rows = await ownedMessagesQuery(db, userId, chatId);
      return {
        status: "owned",
        chat,
        messages: toChatMessages(chat.id, rows),
      };
    }
  }
  const [exists] = await chatExistsQuery(db, chatId);
  return exists ? { status: "not-yours" } : { status: "missing" };
}

// ---- Writes ----

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Creates the chat for this user if it is new, then locks it. Throws
 * ChatOwnershipError when the id is already another account's chat.
 */
async function claimChat(
  tx: Tx,
  userId: string,
  chatId: string,
  title: string,
): Promise<number> {
  if (!isChatId(chatId)) throw new ChatOwnershipError();
  await tx
    .insert(chats)
    .values({ id: chatId, userId, title })
    .onConflictDoNothing({ target: chats.id });
  const [owned] = await tx
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .for("update");
  if (!owned) throw new ChatOwnershipError();
  const [{ next }] = await tx
    .select({
      next: sql<number>`coalesce(max(${messages.seq}), -1)::int + 1`,
    })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return Number(next);
}

async function insertAfter(
  tx: Tx,
  userId: string,
  chatId: string,
  firstSeq: number,
  entries: StoredMessageInput[],
  updatedAt?: Date,
) {
  if (entries.length === 0) return;
  await tx.insert(messages).values(
    entries.map((e, i) => ({
      chatId,
      seq: firstSeq + i,
      role: e.role,
      content: e.content,
    })),
  );
  await tx
    .update(chats)
    .set({ updatedAt: updatedAt ?? sql`now()` })
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
}

/**
 * Appends one turn (usually a user row and an assistant row) to a chat,
 * creating the chat on its first turn with a title from the first user
 * message. Returns the seq of the first row written.
 */
export async function appendTurn(
  db: Db,
  userId: string,
  chatId: string,
  entries: StoredMessageInput[],
): Promise<number> {
  const firstUser = entries.find((e) => e.role === "user");
  const title = firstUser
    ? titleFromMessage(firstUser.content.text) || "New chat"
    : "New chat";
  return db.transaction(async (tx) => {
    const next = await claimChat(tx, userId, chatId, title);
    await insertAfter(tx, userId, chatId, next, entries);
    return next;
  });
}

// ---- Keeping a signed-out tab's chats ----

export const tabChatsSchema = z.object({
  chats: z
    .array(
      z.object({
        id: z.string().refine(isChatId, "Expected a chat id"),
        title: z.string().max(200),
        updatedAt: z.string().max(40),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              text: z.string().max(20_000),
            }),
          )
          .max(200),
      }),
    )
    .max(30),
});

export type TabChats = z.infer<typeof tabChatsSchema>["chats"];

/**
 * Saves chats kept in a tab's sessionStorage to the account. A chat already
 * saved gets only the messages after the ones it has (the tab may have
 * moved on since); a chat id owned by another account is skipped.
 */
export async function importTabChats(
  db: Db,
  userId: string,
  tabChats: TabChats,
  now: Date = new Date(),
): Promise<{ saved: string[]; skipped: string[] }> {
  const saved: string[] = [];
  const skipped: string[] = [];
  for (const chat of tabChats) {
    const firstUser = chat.messages.find((m) => m.role === "user");
    const title =
      titleFromMessage(chat.title || firstUser?.text || "") || "New chat";
    const when = clampDate(chat.updatedAt, now);
    try {
      await db.transaction(async (tx) => {
        const next = await claimChat(tx, userId, chat.id, title);
        // Row seqs line up with the tab's message order, so the rows the
        // account already has are exactly the first `next` messages.
        const tail = chat.messages.slice(next);
        await insertAfter(
          tx,
          userId,
          chat.id,
          next,
          tail.map(
            (m): StoredMessageInput =>
              m.role === "user"
                ? { role: "user", content: userContent(m.text) }
                : {
                    role: "assistant",
                    content: importedAssistantContent(m.text),
                  },
          ),
          when,
        );
      });
      saved.push(chat.id);
    } catch (err) {
      if (err instanceof ChatOwnershipError) skipped.push(chat.id);
      else throw err;
    }
  }
  return { saved, skipped };
}

function clampDate(iso: string, now: Date): Date {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= now.getTime() ? new Date(t) : now;
}
