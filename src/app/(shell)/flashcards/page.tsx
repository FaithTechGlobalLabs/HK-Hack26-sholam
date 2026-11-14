import { Suspense } from "react";
import { FlashcardsView } from "@/components/flashcards/FlashcardsView";
import { SectionTransition } from "@/components/shell/SectionTransition";
import { getPublicDeck } from "@/lib/flashcards/deck";

export default function FlashcardsPage() {
  return (
    <SectionTransition>
      <Suspense
        fallback={
          <p className="p-6 text-sm text-muted-foreground">Loading cards…</p>
        }
      >
        <Deck />
      </Suspense>
    </SectionTransition>
  );
}

/** Cached and public (see getPublicDeck), so it is part of the static shell. */
async function Deck() {
  const cards = await getPublicDeck();
  return <FlashcardsView cards={cards} />;
}
