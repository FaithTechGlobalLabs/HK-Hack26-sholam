"use client";

import { GraduationCap, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type CardKind,
  type Flashcard,
  type FlashcardCategory,
  KIND_LABELS,
  KINDS,
} from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";
import { FlashcardCard } from "./FlashcardCard";
import { NewCardDialog } from "./NewCardDialog";
import { StudyMode } from "./StudyMode";

const searchText = (c: Flashcard) =>
  `${c.question} ${c.kind === "fact" ? c.answer : `${c.section} ${c.tags.join(" ")}`}`.toLowerCase();

export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CardKind | null>(null);
  const [category, setCategory] = useState<FlashcardCategory | null>(null);
  const [studying, setStudying] = useState(false);
  const [creating, setCreating] = useState(false);

  const ofKind = useMemo(
    () => cards.filter((c) => !kind || c.kind === kind),
    [cards, kind],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofKind.filter(
      (c) =>
        (!category || c.category === category) &&
        (!q || searchText(c).includes(q)),
    );
  }, [ofKind, query, category]);

  const used = new Set(ofKind.map((c) => c.category));
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      active ? "bg-foreground text-background" : "hover:bg-muted",
    );

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
          <legend className="sr-only">Kind</legend>
          {[null, ...KINDS].map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setCategory(null);
              }}
              className={chip(kind === k)}
            >
              {k
                ? `${KIND_LABELS[k]} (${cards.filter((c) => c.kind === k).length})`
                : `All (${cards.length})`}
            </button>
          ))}
        </fieldset>

        <fieldset className="mt-2 flex flex-wrap gap-2">
          <legend className="sr-only">Category</legend>
          {[null, ...CATEGORIES.filter((c) => used.has(c))].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(chip(category === c), "text-xs")}
            >
              {c ? CATEGORY_LABELS[c] : "Every topic"}
            </button>
          ))}
        </fieldset>

        {visible.length === 0 ? (
          <p className="mt-10 text-center text-muted-foreground text-sm">
            No cards match. Ask about it in Chat and sholam can draft one.
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
