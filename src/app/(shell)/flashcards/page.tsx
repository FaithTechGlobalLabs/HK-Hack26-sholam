import { Suspense } from "react";
import { FlashcardsView } from "@/components/flashcards/FlashcardsView";
import { SectionTransition } from "@/components/shell/SectionTransition";
import { listFlashcards } from "@/lib/flashcards/repo";

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

async function Deck() {
  const cards = await listFlashcards({ limit: 200 });
  return <FlashcardsView cards={cards} />;
}
