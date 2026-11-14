import { beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/cache", () => cache);

// No DATABASE_URL in tests, so the deck comes from the seed files.
const { DECK_LIMIT, DECK_TAG, getPublicDeck, revalidateDeck } = await import(
  "@/lib/flashcards/deck"
);
const { ALL_SEED_CARDS } = await import("@/lib/flashcards/repo");

describe("public deck cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "");
  });

  it("tags the cached deck so it can be invalidated", async () => {
    const cards = await getPublicDeck();
    expect(cache.cacheTag).toHaveBeenCalledWith(DECK_TAG);
    expect(cache.cacheLife).toHaveBeenCalledWith("hours");
    expect(cards.map((c) => c.id)).toEqual(
      ALL_SEED_CARDS.slice(0, DECK_LIMIT).map((c) => c.id),
    );
  });

  it("is the same for every caller: no arguments, so no per-user key", () => {
    expect(getPublicDeck.length).toBe(0);
  });

  it("invalidates the same tag, expiring the stale copy at once", () => {
    revalidateDeck();
    expect(cache.revalidateTag).toHaveBeenCalledWith(DECK_TAG, { expire: 0 });
  });
});
