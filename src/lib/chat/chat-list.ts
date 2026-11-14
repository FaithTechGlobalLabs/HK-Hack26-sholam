import type { LocalChat } from "./local-history";

/** A chat as the sidebar and the phone Chats panel list it. */
export interface ChatListItem {
  id: string;
  title: string;
  updatedAt: string;
  /** In the account (false: only in this tab's history). */
  saved: boolean;
}

/** `GET /api/chats` rows. */
export interface SavedChat {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * The list to show. Signed out: this tab's chats. Signed in: the account's
 * chats plus any of this tab's chats not (fully) saved yet, newest first.
 * A tab chat counts as saved once the account holds all of its messages.
 */
export function mergeChatLists(
  local: LocalChat[],
  saved: SavedChat[] | null,
): ChatListItem[] {
  if (!saved) {
    return local
      .map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        saved: false,
      }))
      .sort(newestFirst);
  }
  const byId = new Map<string, ChatListItem>();
  for (const c of saved)
    byId.set(c.id, {
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      saved: true,
    });
  for (const c of local) {
    const stored = saved.find((s) => s.id === c.id);
    if (!stored) {
      byId.set(c.id, {
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        saved: false,
      });
    } else if (c.messages.length > stored.messageCount) {
      byId.set(c.id, {
        id: c.id,
        title: stored.title,
        updatedAt: later(c.updatedAt, stored.updatedAt),
        saved: false,
      });
    }
  }
  return [...byId.values()].sort(newestFirst);
}

/** This tab's chats that the account does not fully hold yet. */
export function unsavedTabChats(
  local: LocalChat[],
  saved: SavedChat[],
): LocalChat[] {
  return local.filter((c) => {
    const stored = saved.find((s) => s.id === c.id);
    return !stored || c.messages.length > stored.messageCount;
  });
}

function newestFirst(a: ChatListItem, b: ChatListItem) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function later(a: string, b: string) {
  return a.localeCompare(b) >= 0 ? a : b;
}
