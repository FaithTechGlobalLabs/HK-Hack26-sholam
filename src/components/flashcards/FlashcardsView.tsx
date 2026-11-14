"use client";

import { Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import { browser } from "react-dom";
import { Button } from "@/components/ui/button";
import { deckView, shuffled } from "@/lib/flashcards/shuffle";
import {
  type CardKind,
  type Flashcard,
  KIND_LABELS,
  KINDS,
} from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";
import { NewCardDialog } from "./NewCardDialog";
import { SwipeDeck, SwipeDeckPlaceholder } from "./SwipeDeck";

/**
 * One card at a time (Ricky's swipe deck), with a small switch between the
 * two kinds of card. The deck is shuffled in the browser on each visit; a
 * link from chat (`?card=<id>`, "Related in Shalom") opens it on that card.
 *
 * The header is prerendered with the page. The deck itself renders in the
 * browser only (its order is random), and `?card` is read in its own
 * Suspense boundary so it does not pull the page out of the static shell.
 */
export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<CardKind | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={null}>
        <LinkedCard cards={cards} onCard={setFocusId} />
      </Suspense>
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
        <Suspense fallback={<SwipeDeckPlaceholder />}>
          <ShuffledDeck cards={cards} kind={kind} focusId={focusId} />
        </Suspense>
      </div>
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/** Reports the card a chat link points at (`?card=<id>`), if it is in the deck. */
function LinkedCard({
  cards,
  onCard,
}: {
  cards: Flashcard[];
  onCard: (id: string | null) => void;
}) {
  const id = useSearchParams().get("card");
  useEffect(() => {
    if (id && cards.some((c) => c.id === id)) onCard(id);
  }, [id, cards, onCard]);
  return null;
}

/**
 * Browser-only: the shuffle is random, so the server cannot render a
 * matching first card. Shuffled once per mount (a visit); filters and the
 * chat focus reorder that same shuffle. A new card list (after the cache
 * revalidates) gets a new shuffle.
 */
function ShuffledDeck({
  cards,
  kind,
  focusId,
}: {
  cards: Flashcard[];
  kind: CardKind | null;
  focusId: string | null;
}) {
  use(browser("The deck order is random per visit."));
  const [deal, setDeal] = useState(() => ({
    from: cards,
    order: shuffled(cards),
  }));
  if (deal.from !== cards) setDeal({ from: cards, order: shuffled(cards) });
  const deck = useMemo(
    () => deckView(deal.order, { kind, focusId }),
    [deal.order, kind, focusId],
  );

  return (
    // key: a new deck (kind or focus change) starts fresh, with no gesture state carried over
    <SwipeDeck key={`${kind ?? "all"}:${focusId ?? ""}`} cards={deck} />
  );
}
