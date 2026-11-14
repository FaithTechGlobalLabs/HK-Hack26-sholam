"use client";

import { useEffect, useState } from "react";
import { type LocalChat, listLocalChats } from "./local-history";

/**
 * Recent chats from this tab's history (local-history.ts), kept fresh when
 * a chat is saved ("shalom:chats") or another tab writes storage. Empty on
 * the server and on the first client render, so hydration matches.
 */
export function useLocalChats(): LocalChat[] {
  const [chats, setChats] = useState<LocalChat[]>([]);
  useEffect(() => {
    const refresh = () => setChats(listLocalChats());
    refresh();
    window.addEventListener("shalom:chats", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("shalom:chats", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return chats;
}
