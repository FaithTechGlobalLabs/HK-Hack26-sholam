import { describe, expect, it } from "vitest";
import type { VerseRecord } from "@/lib/agent/events";
import { citedVerses, verseNumber } from "@/lib/chat/cited-verses";

const verse = (id: string): VerseRecord => ({
  id,
  label: id,
  text: `text of ${id}`,
  translation: "BSB",
});
const fetched = Object.fromEntries(
  ["JHN.1.1", "JHN.1.2", "JHN.1.3", "JHN.1.14", "COL.1.15", "COL.1.16"].map(
    (id) => [id, verse(id)],
  ),
);

describe("citedVerses", () => {
  it("expands the range the label names", () => {
    const ids = citedVerses("JHN.1.1", "John 1:1–3", fetched).map((v) => v.id);
    expect(ids).toEqual(["JHN.1.1", "JHN.1.2", "JHN.1.3"]);
  });

  it("accepts a plain hyphen in the label", () => {
    const ids = citedVerses("JHN.1.1", "John 1:1-3", fetched).map((v) => v.id);
    expect(ids).toEqual(["JHN.1.1", "JHN.1.2", "JHN.1.3"]);
  });

  it("only shows verses that were fetched", () => {
    const ids = citedVerses("COL.1.15", "Colossians 1:15-20", fetched).map(
      (v) => v.id,
    );
    expect(ids).toEqual(["COL.1.15", "COL.1.16"]);
  });

  it("falls back to the linked verse when the label is not a reference", () => {
    const ids = citedVerses("JHN.1.14", "the Word became flesh", fetched).map(
      (v) => v.id,
    );
    expect(ids).toEqual(["JHN.1.14"]);
  });

  it("returns nothing for a verse that was never fetched", () => {
    expect(citedVerses("ROM.8.28", "Romans 8:28", fetched)).toEqual([]);
  });
});

describe("verseNumber", () => {
  it("takes the verse from an id", () => {
    expect(verseNumber("1CO.13.4")).toBe("4");
  });
});
