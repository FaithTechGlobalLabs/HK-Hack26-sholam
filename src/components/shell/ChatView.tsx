"use client";

import { useEffect, useRef, useState } from "react";
import type { VerseRecord } from "@/lib/agent/events";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { SourcesPanel } from "./SourcesPanel";
import { useChatStream } from "./useChatStream";

export function ChatView({
  chatId,
  suggestions,
}: {
  chatId?: string;
  suggestions: string[];
}) {
  const { messages, busy, send, stop } = useChatStream(chatId);
  const [sources, setSources] = useState<VerseRecord[] | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentQuery = useRef(false);

  // "Ask about this in chat" arrives as ?q=. A hold on a flashcard adds send=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (!q || sentQuery.current) return;
    if (params.get("send") === "1") {
      sentQuery.current = true;
      window.history.replaceState(null, "", "/");
      send(q);
      return;
    }
    setDraft(q);
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
            <h1 className="text-center font-medium text-2xl drop-shadow-[0_2px_10px_rgb(25_60_120/0.35)]">
              Ask about the Bible, or test what you know.
            </h1>
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
                      className="glass-btn rounded-full px-3.5 py-1.5 text-sm"
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
                <MessageList messages={messages} onShowSources={setSources} />
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
              <p className="mt-2 text-center text-muted-foreground text-xs">
                Verse text is from the Berean Standard Bible. sholam can still
                make mistakes; check what matters.
              </p>
            </div>
          </>
        )}
      </div>
      {sources && (
        <SourcesPanel verses={sources} onClose={() => setSources(null)} />
      )}
    </div>
  );
}
