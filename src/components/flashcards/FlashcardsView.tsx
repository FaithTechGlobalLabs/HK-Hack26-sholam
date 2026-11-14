"use client";

import { GraduationCap, Plus, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Flashcard,
  type FlashcardCategory,
} from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";
import { FlashcardCard } from "./FlashcardCard";
import { NewCardDialog } from "./NewCardDialog";
import { StudyMode } from "./StudyMode";

export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FlashcardCategory | null>(null);
  const [studying, setStudying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("card");
    if (id && cards.some((c) => c.id === id)) setFocusId(id);
  }, [searchParams, cards]);

  const focused = focusId ? cards.find((c) => c.id === focusId) : undefined;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!category || c.category === category) &&
        (!q || `${c.question} ${c.answer}`.toLowerCase().includes(q)),
    );
  }, [cards, query, category]);

  const used = new Set(cards.map((c) => c.category));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-semibold text-xl">Flashcards</h1>
          <Button
            variant="outline"
            onClick={() => setStudying(true)}
            disabled={visible.length === 0}
          >
            <GraduationCap /> Study
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus /> New card
          </Button>
        </div>

        {focused && (
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">From Shalom Guide</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-sm hover:bg-muted"
                onClick={() => setFocusId(null)}
              >
                <X className="size-3.5" /> Clear
              </button>
            </div>
            <FlashcardCard card={focused} large />
          </div>
        )}

        <label className="mt-4 flex items-center gap-2 rounded-lg border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards"
            className="h-10 flex-1 bg-transparent outline-none"
          />
        </label>

        <fieldset className="mt-3 flex flex-wrap gap-2">
          <legend className="sr-only">Category</legend>
          {[null, ...CATEGORIES.filter((c) => used.has(c))].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                category === c
                  ? "bg-foreground text-background"
                  : "hover:bg-muted",
              )}
            >
              {c ? CATEGORY_LABELS[c] : "All"}
            </button>
          ))}
        </fieldset>

        {visible.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground text-sm">
            No cards match. Ask about it in Chat and Shalom Guide can draft one.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((card) => (
              <li key={card.id}>
                <FlashcardCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {studying && (
        <StudyMode cards={visible} onClose={() => setStudying(false)} />
      )}
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
