"use client";

import { useCallback, useRef, useState } from "react";
import {
  type AgentEvent,
  SseDecoder,
  type VerseRecord,
} from "@/lib/agent/events";
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

export function useChatStream(chatId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      const user = newMessage("user", text);
      const assistant = newMessage("assistant");
      setMessages((prev) => [...prev, user, assistant]);
      setBusy(true);

      const update = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === assistant.id ? fn(m) : m)),
        );

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: text }),
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
      }
    },
    [chatId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, busy, send, stop };
}
