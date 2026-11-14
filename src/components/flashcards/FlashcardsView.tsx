"use client";

import { Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
 * two kinds of card. A link from chat (`?card=<id>`, "Related in Shalom")
 * opens the deck on that card first.
 */
export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<CardKind | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("card");
    if (id && cards.some((c) => c.id === id)) setFocusId(id);
  }, [searchParams, cards]);

  const deck = useMemo(() => {
    const ofKind = kind ? cards.filter((c) => c.kind === kind) : cards;
    const focused = focusId ? ofKind.find((c) => c.id === focusId) : undefined;
    return focused
      ? [focused, ...ofKind.filter((c) => c.id !== focusId)]
      : ofKind;
  }, [cards, kind, focusId]);

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
        {focusId && (
          <p className="flex w-full items-center gap-2 text-sm text-white/90">
            <span className="mr-auto">From Shalom Guide</span>
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-white/15"
            >
              <X className="size-3.5" /> Show the full deck
            </button>
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        {/* key: a new deck (kind or focus change) starts fresh, with no gesture state carried over */}
        <SwipeDeck key={`${kind ?? "all"}:${focusId ?? ""}`} cards={deck} />
      </div>
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
