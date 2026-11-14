/**
 * Chat history for signed-out visitors: recent threads in sessionStorage
 * (tab lifetime). Signed-in chats are saved per account in Postgres
 * (store.ts); on sign-in the tab's chats can be kept (KeepTabChats), and
 * signing out clears them.
 */

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

const KEY = "shalom.chats.v1";

function readAll(): LocalChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalChat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(chats: LocalChat[]) {
  sessionStorage.setItem(KEY, JSON.stringify(chats.slice(0, 30)));
}

export function listLocalChats(): LocalChat[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLocalChat(id: string): LocalChat | undefined {
  return readAll().find((c) => c.id === id);
}

export function upsertLocalChat(chat: LocalChat) {
  const all = readAll().filter((c) => c.id !== chat.id);
  all.unshift(chat);
  writeAll(all);
}

/** Forgets this tab's chats (on sign-out, so the next person can't read them). */
export function clearLocalChats() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 42 ? clean : `${clean.slice(0, 40)}…`;
}
