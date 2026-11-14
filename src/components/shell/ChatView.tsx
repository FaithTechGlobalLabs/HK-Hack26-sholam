"use client";

import { useEffect, useRef, useState } from "react";
import { takeChatQuestion } from "@/lib/chat/handoff";
import type { StoredChatMessage } from "@/lib/chat/stored-content";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { useChatStream } from "./useChatStream";

export function ChatView({
  chatId,
  suggestions,
  initialMessages,
}: {
  chatId?: string;
  suggestions: string[];
  /** A saved chat's messages (signed-in owner), loaded by /c/[chatId]. */
  initialMessages?: StoredChatMessage[];
}) {
  const { messages, busy, send, stop } = useChatStream(chatId, initialMessages);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // A held flashcard queues its question in sessionStorage (one-shot,
  // same-origin; see lib/chat/handoff.ts) and it is sent here. Next keeps
  // this page alive while hidden and re-runs effects when it is shown, so
  // this also fires when chat comes back into view. `?q=` only pre-fills.
  useEffect(() => {
    const queued = takeChatQuestion();
    if (queued) {
      send(queued);
      return;
    }
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setDraft(q);
  }, [send]);

  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
            <div className="max-w-xl text-center drop-shadow-[0_2px_10px_rgb(25_60_120/0.35)]">
              <p className="text-sm text-white/90 tracking-wide">
                Shalom Guide
              </p>
              <h1 className="mt-2 text-balance font-medium text-2xl">
                Ask about the Bible, Jesus, faith, or anything you are curious
                about.
              </h1>
              <p className="mt-2 text-sm text-white/90">
                Clear answers, honest about uncertainty, with pathways into
                Shalom when a real card fits.
              </p>
            </div>
            <div className="w-full max-w-2xl">
              <Composer
                value={draft}
                onChange={setDraft}
                onSend={send}
                onStop={stop}
                busy={busy}
              />
            </div>
            {suggestions.length > 0 && (
              <ul className="flex max-w-2xl flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => send(s)}
                      className="glass-btn rounded-full bg-[rgb(30_70_150/0.35)] px-3.5 py-1.5 text-sm"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-4 py-6">
                <MessageList messages={messages} />
                <div ref={bottomRef} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">
              <Composer
                value={draft}
                onChange={setDraft}
                onSend={send}
                onStop={stop}
                busy={busy}
              />
              <p className="mt-2 text-center text-[13px] text-white/90">
                Verse text is from the Berean Standard Bible. Shalom Guide can
                still make mistakes; check what matters.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
