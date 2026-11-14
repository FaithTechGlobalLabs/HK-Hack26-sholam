import { Suspense } from "react";
import { FlashcardsView } from "@/components/flashcards/FlashcardsView";
import { listFlashcards } from "@/lib/flashcards/repo";

export default function FlashcardsPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-muted-foreground">Loading cards…</p>
      }
    >
      <Deck />
    </Suspense>
  );
}

async function Deck() {
  const cards = await listFlashcards({ limit: 200 });
  return <FlashcardsView cards={cards} />;
}
