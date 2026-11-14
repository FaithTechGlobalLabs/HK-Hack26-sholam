"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { passageLabel } from "@/lib/bible/refs";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";

/**
 * Fact cards flip to their answer and verses. Discover cards (open
 * questions) flip to their Scripture starting points and invite a chat.
 */
export function FlashcardCard({
  card,
  large = false,
}: {
  card: Flashcard;
  large?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const discover = card.kind === "discover";
  const backLabel = discover ? "Starting points" : "Answer";
  const titleSize = large ? "text-2xl" : "text-lg";

  return (
    <div
      className={cn(
        "glass flex flex-col rounded-2xl transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:shadow-xl",
        large ? "min-h-80" : "min-h-56",
      )}
    >
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={
          flipped ? "Show question" : `Show ${backLabel.toLowerCase()}`
        }
        onClick={() => setFlipped((f) => !f)}
        className="flex flex-1 flex-col gap-3 p-5 text-left"
      >
        <span className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[card.category]} ·{" "}
          {flipped ? backLabel : discover ? "Discover" : "Question"}
        </span>

        {!flipped && (
          <>
            <span className={cn("font-medium", titleSize)}>
              {card.question}
            </span>
            {discover && (card.tags.length > 0 || card.minutes) && (
              <span className="mt-auto text-muted-foreground text-xs">
                {[...card.tags, card.minutes ? `${card.minutes} min` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </>
        )}

        {flipped && card.kind === "fact" && (
          <>
            <span className={cn("font-medium", titleSize)}>{card.answer}</span>
            {card.explanation && (
              <span className="text-muted-foreground text-sm">
                {card.explanation}
              </span>
            )}
            <span className="mt-auto text-muted-foreground text-xs">
              {card.refs.map(passageLabel).join(" · ")}
            </span>
          </>
        )}

        {flipped && card.kind === "discover" && (
          <>
            <ul className="flex flex-col gap-1">
              {card.refs.map((ref) => (
                <li
                  key={ref}
                  className={cn("font-medium", large ? "text-xl" : "text-base")}
                >
                  {passageLabel(ref)}
                </li>
              ))}
            </ul>
            <span className="mt-auto text-muted-foreground text-xs">
              Places to start reading, not a fixed answer. Explore them in chat.
            </span>
          </>
        )}
      </button>
      <div className="border-t px-5 py-2">
        <Link
          href={`/?q=${encodeURIComponent(card.question)}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <MessageCircle className="size-4" />{" "}
          {discover ? "Explore in chat" : "Ask about this in chat"}
        </Link>
      </div>
    </div>
  );
}
