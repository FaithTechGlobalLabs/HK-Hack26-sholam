"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { passageLabel } from "@/lib/bible/refs";
import type { FlashcardDraft } from "@/lib/flashcards/types";
import { saveFlashcard } from "./saveFlashcard";

/** A card the agent drafted. Nothing is saved until the user adds it. */
export function FlashcardProposal({ draft }: { draft: FlashcardDraft }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "dismissed">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  if (state === "dismissed") return null;

  const add = async () => {
    setState("saving");
    const err = await saveFlashcard(draft);
    setError(err);
    setState(err ? "idle" : "saved");
  };

  return (
    <div className="rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">Suggested flashcard</p>
      <p className="mt-2 font-medium">{draft.question}</p>
      <p className="mt-1 text-sm">{draft.answer}</p>
      <p className="mt-2 text-muted-foreground text-xs">
        {draft.refs.map(passageLabel).join(" · ")}
      </p>
      {error && <p className="mt-2 text-muted-foreground text-sm">{error}</p>}
      <div className="mt-3 flex gap-2">
        {state === "saved" ? (
          <p className="text-sm">Added to the deck.</p>
        ) : (
          <>
            <Button size="sm" onClick={add} disabled={state === "saving"}>
              {state === "saving" ? "Adding…" : "Add to deck"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setState("dismissed")}
            >
              Not now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
