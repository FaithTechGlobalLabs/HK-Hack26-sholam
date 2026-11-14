import type { CardKind, Flashcard } from "./types";

/**
 * A new array in uniformly random order (Fisher–Yates). The input is not
 * changed. `random` returns a number in [0, 1), like `Math.random`.
 */
export function shuffled<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * What the deck shows: the shuffled cards, narrowed to one kind when a
 * filter is on, with the card linked from chat (`?card=<id>`) moved to the
 * front. Filtering keeps the shuffled order, so switching filters does not
 * reshuffle.
 */
export function deckView(
  order: readonly Flashcard[],
  { kind, focusId }: { kind: CardKind | null; focusId: string | null },
): Flashcard[] {
  const ofKind = kind ? order.filter((card) => card.kind === kind) : [...order];
  const at = focusId ? ofKind.findIndex((card) => card.id === focusId) : -1;
  if (at > 0) ofKind.unshift(...ofKind.splice(at, 1));
  return ofKind;
}
