"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type CardKind,
  type Flashcard,
  KIND_LABELS,
  KINDS,
} from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";
import { NewCardDialog } from "./NewCardDialog";
import { SwipeDeck } from "./SwipeDeck";

/**
 * One card at a time (Ricky's swipe deck), with a small switch between the
 * two kinds of card: quick facts and discover questions.
 */
export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<CardKind | null>(null);
  const deck = useMemo(
    () => (kind ? cards.filter((c) => c.kind === kind) : cards),
    [cards, kind],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-3 px-4 pt-4">
        <h1 className="mr-auto font-semibold text-xl">Flashcards</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New card
        </Button>
        <fieldset className="flex w-full gap-1.5">
          <legend className="sr-only">Which cards</legend>
          {[null, ...KINDS].map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "glass-btn rounded-full px-3 py-1 text-xs",
                kind === k &&
                  "bg-white/90 font-medium text-[#1f4f9e] [text-shadow:none]",
              )}
            >
              {k ? KIND_LABELS[k] : "All"}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        {/* key: a new deck starts fresh, with no gesture state carried over */}
        <SwipeDeck key={kind ?? "all"} cards={deck} />
      </div>
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
