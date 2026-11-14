import { describe, expect, it } from "vitest";
import { ALL_SEED_CARDS } from "@/lib/flashcards/repo";
import { deckView, shuffled } from "@/lib/flashcards/shuffle";

/** Deterministic [0, 1) source (mulberry32) so failures reproduce. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("shuffled", () => {
  it("keeps every item exactly once and leaves the input alone", () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const copy = input.slice();
    const out = shuffled(input, seeded(1));
    expect(out).not.toBe(input);
    expect(input).toEqual(copy);
    expect(out.slice().sort((a, b) => a - b)).toEqual(copy);
    expect(out).not.toEqual(copy);
  });

  it("gives a different order on each call", () => {
    const random = seeded(7);
    const a = shuffled(ALL_SEED_CARDS, random);
    const b = shuffled(ALL_SEED_CARDS, random);
    expect(ids(a)).not.toEqual(ids(b));
  });

  it("handles empty and single-item lists", () => {
    expect(shuffled([])).toEqual([]);
    expect(shuffled(["only"])).toEqual(["only"]);
  });

  it("is uniform: each item lands in each position about equally", () => {
    const n = 4;
    const runs = 40_000;
    const counts = Array.from({ length: n }, () => new Array(n).fill(0));
    const random = seeded(42);
    for (let r = 0; r < runs; r++) {
      shuffled([0, 1, 2, 3], random).forEach((item, pos) => {
        counts[item][pos]++;
      });
    }
    const expected = runs / n;
    for (const row of counts)
      for (const c of row) expect(Math.abs(c - expected)).toBeLessThan(400);
  });
});

describe("deckView", () => {
  const order = shuffled(ALL_SEED_CARDS, seeded(3));

  it("shows the whole shuffled deck when no filter is on", () => {
    expect(ids(deckView(order, { kind: null, focusId: null }))).toEqual(
      ids(order),
    );
  });

  it("filters by kind without reshuffling", () => {
    for (const kind of ["fact", "discover"] as const) {
      const view = deckView(order, { kind, focusId: null });
      expect(view.length).toBeGreaterThan(0);
      expect(view.every((c) => c.kind === kind)).toBe(true);
      expect(ids(view)).toEqual(ids(order.filter((c) => c.kind === kind)));
    }
  });

  it("puts the card linked from chat first, keeping the rest in order", () => {
    const target = order[order.length - 1];
    const view = deckView(order, { kind: null, focusId: target.id });
    expect(view[0].id).toBe(target.id);
    expect(ids(view.slice(1))).toEqual(ids(order.slice(0, -1)));
    expect(view).toHaveLength(order.length);
  });

  it("keeps the linked card first under its own kind's filter", () => {
    const target = order.findLast((c) => c.kind === "discover");
    if (!target) throw new Error("seed deck has no discover cards");
    const view = deckView(order, { kind: "discover", focusId: target.id });
    expect(view[0].id).toBe(target.id);
    expect(view.every((c) => c.kind === "discover")).toBe(true);
  });

  it("ignores a linked card the filter or the deck does not include", () => {
    const fact = order.find((c) => c.kind === "fact");
    if (!fact) throw new Error("seed deck has no fact cards");
    const discoverOnly = order.filter((c) => c.kind === "discover");
    expect(
      ids(deckView(order, { kind: "discover", focusId: fact.id })),
    ).toEqual(ids(discoverOnly));
    expect(ids(deckView(order, { kind: null, focusId: "missing" }))).toEqual(
      ids(order),
    );
  });
});
