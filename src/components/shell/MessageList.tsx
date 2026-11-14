"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Layers,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  Children,
  isValidElement,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FlashcardProposal } from "@/components/flashcards/FlashcardProposal";
import { extractCitations, VERSE_PROTOCOL } from "@/lib/agent/citations";
import type { VerseRecord } from "@/lib/agent/events";
import { citedVerses, verseNumber } from "@/lib/chat/cited-verses";
import { cn } from "@/lib/utils";
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

/** Plain text of a markdown link's children (the reference label). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node))
    return textOf(node.props.children);
  return Children.toArray(node).map(textOf).join("");
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
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
            <AssistantMessage message={m} />
          </li>
        ),
      )}
    </ol>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const [versesOpen, setVersesOpen] = useState(false);
  const running = message.tools.filter((t) => !t.done);
  const passages = useMemo(() => answerPassages(message), [message]);

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
                const id = href.slice(VERSE_PROTOCOL.length);
                const issue = message.unverified[id];
                const label = textOf(children);
                return (
                  <VerseChip
                    label={label}
                    verses={issue ? [] : citedVerses(id, label, message.verses)}
                    reason={issue}
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
        <section
          aria-label="Related flashcards"
          className="rounded-2xl bg-[rgb(20_52_115/0.35)] p-2 backdrop-blur-xl"
        >
          <h3 className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 font-medium text-[13px] text-white/90">
            <Layers aria-hidden className="size-3.5" /> Related flashcards
          </h3>
          <ul className="flex flex-col">
            {message.cards.map((card) => (
              <li key={card.id}>
                <Link
                  href={`/flashcards?card=${encodeURIComponent(card.id)}`}
                  transitionTypes={["to-cards"]}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-2 text-[15px] hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
                >
                  <span>{card.question}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {message.quoteWarnings.length > 0 && !message.streaming && (
        <p className="text-muted-foreground text-xs">
          Quoted words for {message.quoteWarnings.join(", ")} were not checked
          against the Bible text.
        </p>
      )}

      {message.proposal && <FlashcardProposal draft={message.proposal} />}
      {message.error && (
        <p className="text-destructive text-sm">{message.error}</p>
      )}

      {!message.streaming && message.text && (
        <div className="flex flex-wrap items-center gap-1 text-white/90">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
            onClick={async () => {
              await navigator.clipboard.writeText(message.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Copy aria-hidden className="size-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          {passages.checked.length > 0 && (
            <button
              type="button"
              aria-expanded={versesOpen}
              aria-controls={`verses-${message.id}`}
              onClick={() => setVersesOpen((o) => !o)}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
            >
              <BookOpen aria-hidden className="size-4" />
              {passages.checked.length === 1
                ? "1 Bible passage"
                : `${passages.checked.length} Bible passages`}
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform duration-200 motion-reduce:transition-none",
                  versesOpen && "rotate-180",
                )}
              />
            </button>
          )}
        </div>
      )}

      {versesOpen && !message.streaming && (
        <section
          id={`verses-${message.id}`}
          aria-label="Bible passages in this answer"
          className="rounded-2xl bg-[rgb(20_52_115/0.42)] px-5 py-4 backdrop-blur-xl"
        >
          <p className="text-[13px] text-white/85">
            Text from the Berean Standard Bible, looked up before answering.
          </p>
          <ol className="mt-3 flex flex-col gap-4">
            {passages.checked.map((p) => (
              <li key={p.verseId}>
                <h3 className="font-semibold text-[15px]">{p.label}</h3>
                <div className="mt-1 space-y-1 text-[15px] text-white/95 leading-relaxed">
                  {p.verses.map((v) => (
                    <p key={v.id}>
                      <sup className="mr-1 font-semibold text-[11px] text-white/75">
                        {verseNumber(v.id)}
                      </sup>
                      {v.text}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          {passages.unchecked.length > 0 && (
            <p className="mt-4 border-white/20 border-t pt-3 text-[13px] text-white/85">
              Not checked: {passages.unchecked.join(", ")}. Shalom did not look
              these up before answering, so their wording may not match the
              Bible text.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** The passages an answer cites, in order: the checked ones with their
 * fetched text, and the labels of the ones that were not checked. */
function answerPassages(message: ChatMessage) {
  const checked: { verseId: string; label: string; verses: VerseRecord[] }[] =
    [];
  const unchecked: string[] = [];
  const seen = new Set<string>();
  for (const c of extractCitations(message.text)) {
    if (seen.has(c.verseId)) continue;
    seen.add(c.verseId);
    const verses = message.unverified[c.verseId]
      ? []
      : citedVerses(c.verseId, c.label, message.verses);
    if (verses.length) checked.push({ ...c, verses });
    else unchecked.push(c.label);
  }
  return { checked, unchecked };
}
