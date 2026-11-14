"use client";

import { BookOpen, Check, Copy, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FlashcardProposal } from "@/components/flashcards/FlashcardProposal";
import { VERSE_PROTOCOL } from "@/lib/agent/citations";
import type { VerseRecord } from "@/lib/agent/events";
import type { ChatMessage } from "./useChatStream";
import { VerseChip } from "./VerseChip";

// react-markdown drops unknown URL schemes; keep `verse:` links for chips.
const urlTransform = (url: string) =>
  url.startsWith(VERSE_PROTOCOL) ? url : defaultUrlTransform(url);

const TOOL_LABELS: Record<string, string> = {
  search_flashcards: "Searching flashcards",
  lookup_verses: "Looking up verses",
  search_bible: "Searching the Bible",
  propose_flashcard: "Drafting a flashcard",
};

export function MessageList({
  messages,
  onShowSources,
}: {
  messages: ChatMessage[];
  onShowSources: (verses: VerseRecord[]) => void;
}) {
  return (
    <ol className="flex flex-col gap-8">
      {messages.map((m) =>
        m.role === "user" ? (
          <li
            key={m.id}
            className="self-end rounded-3xl bg-muted px-4 py-2 whitespace-pre-wrap"
          >
            {m.text}
          </li>
        ) : (
          <li key={m.id}>
            <AssistantMessage message={m} onShowSources={onShowSources} />
          </li>
        ),
      )}
    </ol>
  );
}

function AssistantMessage({
  message,
  onShowSources,
}: {
  message: ChatMessage;
  onShowSources: (verses: VerseRecord[]) => void;
}) {
  const [copied, setCopied] = useState(false);
  const verses = Object.values(message.verses);
  const running = message.tools.filter((t) => !t.done);

  return (
    <div className="flex flex-col gap-3">
      {running.map((t) => (
        <p
          key={t.id}
          className="flex items-center gap-2 text-muted-foreground text-sm"
        >
          <Loader2 className="size-3.5 animate-spin" />{" "}
          {TOOL_LABELS[t.name] ?? t.name}…
        </p>
      ))}

      <div className="prose-sm rounded-3xl bg-[rgb(20_52_115/0.5)] px-5 py-4 leading-7 backdrop-blur-xl [&_ol]:list-decimal [&_ol]:pl-6 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        <Markdown
          remarkPlugins={[remarkGfm]}
          urlTransform={urlTransform}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith(VERSE_PROTOCOL)) {
                return (
                  <VerseChip
                    verse={message.verses[href.slice(VERSE_PROTOCOL.length)]}
                    label={children}
                  />
                );
              }
              if (href?.startsWith("/")) {
                return (
                  <Link href={href} className="underline underline-offset-4">
                    {children}
                  </Link>
                );
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {message.text}
        </Markdown>
        {message.streaming && !message.text && running.length === 0 && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {message.cards.length > 0 && !message.streaming && (
        <ul className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
          <li className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Layers className="size-3.5" /> Related in Shalom
          </li>
          {message.cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/flashcards?card=${encodeURIComponent(card.id)}`}
                transitionTypes={["to-cards"]}
                className="block text-sm underline-offset-4 hover:underline"
              >
                {card.question}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {message.proposal && <FlashcardProposal draft={message.proposal} />}
      {message.error && (
        <p className="text-destructive text-sm">{message.error}</p>
      )}

      {!message.streaming && message.text && (
        <div className="flex gap-1 text-muted-foreground">
          <button
            type="button"
            aria-label="Copy"
            className="rounded-md p-1.5 hover:bg-muted"
            onClick={async () => {
              await navigator.clipboard.writeText(message.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
          {verses.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => onShowSources(verses)}
            >
              <BookOpen className="size-4" /> Sources
            </button>
          )}
        </div>
      )}
    </div>
  );
}
