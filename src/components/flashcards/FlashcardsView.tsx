"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/lib/flashcards/types";
import { NewCardDialog } from "./NewCardDialog";
import { SwipeDeck } from "./SwipeDeck";

export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-6">
        <h1 className="mr-auto font-semibold text-xl">Flashcards</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New card
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-28">
        <SwipeDeck cards={cards} />
      </div>
      {creating && <NewCardDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
