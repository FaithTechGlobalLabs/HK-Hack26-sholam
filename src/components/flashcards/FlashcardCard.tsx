"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { verseIdToLabel } from "@/lib/bible/refs";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";

/** Question on the front; tap to flip to the answer and its verses. */
export function FlashcardCard({
  card,
  large = false,
}: {
  card: Flashcard;
  large?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card",
        large ? "min-h-80" : "min-h-56",
      )}
    >
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={flipped ? "Show question" : "Show answer"}
        onClick={() => setFlipped((f) => !f)}
        className="flex flex-1 flex-col gap-3 p-5 text-left"
      >
        <span className="text-muted-foreground text-xs">
          {CATEGORY_LABELS[card.category]} · {flipped ? "Answer" : "Question"}
        </span>
        {flipped ? (
          <>
            <span className={cn("font-medium", large ? "text-2xl" : "text-lg")}>
              {card.answer}
            </span>
            {card.explanation && (
              <span className="text-muted-foreground text-sm">
                {card.explanation}
              </span>
            )}
            <span className="mt-auto text-muted-foreground text-xs">
              {card.refs.map(verseIdToLabel).join(" · ")}
            </span>
          </>
        ) : (
          <span className={cn("font-medium", large ? "text-2xl" : "text-lg")}>
            {card.question}
          </span>
        )}
      </button>
      <div className="border-t px-5 py-2">
        <Link
          href={`/?q=${encodeURIComponent(card.question)}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <MessageCircle className="size-4" /> Ask about this in chat
        </Link>
      </div>
    </div>
  );
}
