"use client";

import { ArrowLeft, ArrowRight, Shuffle, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/lib/flashcards/types";
import { FlashcardCard } from "./FlashcardCard";

/** One card at a time. Phase 3: keep score and resurface missed cards. */
export function StudyMode({
  cards,
  onClose,
}: {
  cards: Flashcard[];
  onClose: () => void;
}) {
  const [order, setOrder] = useState(cards);
  const [index, setIndex] = useState(0);
  const card = order[index];

  const shuffle = () => {
    const next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setIndex(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Study"
      className="fixed inset-0 z-50 flex flex-col bg-background backdrop-blur-2xl"
    >
      <div className="flex h-12 items-center justify-between px-4">
        <span className="text-muted-foreground text-sm">
          {index + 1} / {order.length}
        </span>
        <button
          type="button"
          aria-label="Close study"
          onClick={onClose}
          className="rounded-md p-2 hover:bg-muted"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-xl">
          {/* key resets the flip state for each card */}
          <FlashcardCard key={card.id} card={card} large />
        </div>
      </div>
      <div className="flex justify-center gap-2 pb-8">
        <Button
          variant="outline"
          onClick={() => setIndex((i) => i - 1)}
          disabled={index === 0}
        >
          <ArrowLeft /> Back
        </Button>
        <Button variant="outline" onClick={shuffle}>
          <Shuffle /> Shuffle
        </Button>
        <Button
          onClick={() => setIndex((i) => i + 1)}
          disabled={index === order.length - 1}
        >
          Next <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
