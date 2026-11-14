"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { type AccountState, useAccount } from "@/lib/account/use-account";
import {
  type ChatListItem,
  mergeChatLists,
  type SavedChat,
  unsavedTabChats,
} from "./chat-list";
import type { LocalChat } from "./local-history";
import { useLocalChats } from "./use-local-chats";

/**
 * Chats for the sidebar and the phone Chats panel. Signed out, this tab's
 * sessionStorage history; signed in, the account's chats from
 * `/api/chats` (fetched once, then again after each turn, which fires
 * "shalom:chats") plus tab chats not saved yet, which `keepTabChats` saves.
 */

let saved: SavedChat[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: SavedChat[] | null) {
  saved = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function refreshSaved(): Promise<void> {
  loading ??= (async () => {
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { chats: SavedChat[] };
      publish(body.chats);
    } catch {
      // Keep the last list; the next turn tries again.
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export interface ChatList {
  account: AccountState;
  chats: ChatListItem[];
  /** Tab chats the account does not hold yet (signed in only). */
  unsaved: LocalChat[];
  /** Saves `unsaved` to the account. Resolves false if that failed. */
  keepTabChats: () => Promise<boolean>;
}

export function useChatList(): ChatList {
  const account = useAccount();
  const local = useLocalChats();
  const storing = account.status === "signed-in" && account.canSave;
  const savedChats = useSyncExternalStore(
    subscribe,
    () => saved,
    () => null,
  );

  useEffect(() => {
    if (!storing) return;
    if (saved === null) void refreshSaved();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onTurn = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshSaved(), 400);
    };
    window.addEventListener("shalom:chats", onTurn);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("shalom:chats", onTurn);
    };
  }, [storing]);

  const list = storing ? savedChats : null;
  const chats = useMemo(() => mergeChatLists(local, list), [local, list]);
  const unsaved = useMemo(
    () => (list ? unsavedTabChats(local, list) : []),
    [local, list],
  );

  const keepTabChats = useCallback(async () => {
    if (unsaved.length === 0) return true;
    try {
      const res = await fetch("/api/chats/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chats: unsaved.map((c) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt,
            messages: c.messages.map((m) => ({ role: m.role, text: m.text })),
          })),
        }),
      });
      await refreshSaved();
      return res.ok;
    } catch {
      return false;
    }
  }, [unsaved]);

  return { account, chats, unsaved, keepTabChats };
}
