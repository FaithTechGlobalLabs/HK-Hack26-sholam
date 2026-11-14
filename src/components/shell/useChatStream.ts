"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AgentEvent,
  SseDecoder,
  type VerseRecord,
} from "@/lib/agent/events";
import {
  getLocalChat,
  type LocalChatMessage,
  titleFromMessage,
  upsertLocalChat,
} from "@/lib/chat/local-history";
import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";

export interface ToolStatus {
  id: string;
  name: string;
  done: boolean;
  ok?: boolean;
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Verses tools returned during this turn, by id. Drives citation chips. */
  verses: Record<string, VerseRecord>;
  tools: ToolStatus[];
  cards: FlashcardSummary[];
  proposal?: FlashcardDraft;
  error?: string;
  streaming: boolean;
}

function applyEvent(message: ChatMessage, event: AgentEvent): ChatMessage {
  switch (event.type) {
    case "text_delta":
      return { ...message, text: message.text + event.text };
    case "tool_start":
      return {
        ...message,
        tools: [
          ...message.tools,
          { id: event.id, name: event.name, done: false },
        ],
      };
    case "tool_result":
      return {
        ...message,
        tools: message.tools.map((t) =>
          t.id === event.id
            ? { ...t, done: true, ok: event.ok, summary: event.summary }
            : t,
        ),
      };
    case "verses":
      return {
        ...message,
        verses: {
          ...message.verses,
          ...Object.fromEntries(event.verses.map((v) => [v.id, v])),
        },
      };
    case "flashcards":
      return { ...message, cards: event.cards };
    case "flashcard_proposal":
      return { ...message, proposal: event.draft };
    case "error":
      return { ...message, error: event.message, streaming: false };
    case "done":
      return { ...message, streaming: false };
  }
}

const newMessage = (role: ChatMessage["role"], text = ""): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  verses: {},
  tools: [],
  cards: [],
  streaming: role === "assistant",
});

function toLocal(messages: ChatMessage[]): LocalChatMessage[] {
  return messages
    .filter((m) => m.text || m.role === "user")
    .map((m) => ({ id: m.id, role: m.role, text: m.text }));
}

export function useChatStream(chatId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // Empty until mount/first send — crypto.randomUUID() is not prerender-safe.
  const [activeChatId, setActiveChatId] = useState(chatId ?? "");
  const abortRef = useRef<AbortController | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (chatId) {
      const existing = getLocalChat(chatId);
      if (existing) {
        setActiveChatId(existing.id);
        setMessages(
          existing.messages.map((m) => ({
            ...newMessage(m.role, m.text),
            streaming: false,
          })),
        );
        return;
      }
      setActiveChatId(chatId);
      return;
    }
    setActiveChatId(crypto.randomUUID());
  }, [chatId]);

  const persist = useCallback((next: ChatMessage[], id: string) => {
    const firstUser = next.find((m) => m.role === "user");
    upsertLocalChat({
      id,
      title: firstUser ? titleFromMessage(firstUser.text) : "New chat",
      updatedAt: new Date().toISOString(),
      messages: toLocal(next),
    });
    window.dispatchEvent(new Event("shalom:chats"));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const threadId = activeChatId || crypto.randomUUID();
      if (!activeChatId) setActiveChatId(threadId);

      const user = newMessage("user", text);
      const assistant = newMessage("assistant");
      let snapshot: ChatMessage[] = [];
      setMessages((prev) => {
        snapshot = [...prev, user, assistant];
        return snapshot;
      });
      setBusy(true);

      const history = snapshot
        .slice(0, -2)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => m.text)
        .map((m) => ({ role: m.role, content: m.text }));

      const update = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => {
          const next = prev.map((m) => (m.id === assistant.id ? fn(m) : m));
          return next;
        });

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: threadId,
            message: text,
            history,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body)
          throw new Error(`Request failed (${res.status})`);

        const reader = res.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        const decoder = new SseDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const event of decoder.push(value))
            update((m) => applyEvent(m, event));
        }
        update((m) => ({ ...m, streaming: false }));
      } catch (err) {
        if (controller.signal.aborted)
          update((m) => ({ ...m, streaming: false }));
        else
          update((m) => ({
            ...m,
            streaming: false,
            error: err instanceof Error ? err.message : "Request failed",
          }));
      } finally {
        abortRef.current = null;
        setBusy(false);
        setMessages((prev) => {
          const snapshot = prev;
          queueMicrotask(() => {
            persist(snapshot, threadId);
            if (!chatId && snapshot.some((m) => m.role === "user")) {
              const url = `/c/${threadId}`;
              if (window.location.pathname !== url)
                window.history.replaceState(null, "", url);
            }
          });
          return prev;
        });
      }
    },
    [activeChatId, chatId, persist],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, busy, send, stop, chatId: activeChatId };
}
