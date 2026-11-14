import { describe, expect, it } from "vitest";
import {
  BOOKS,
  bookByCode,
  findBook,
  normalizeBookName,
} from "@/lib/bible/books";
import {
  isVerseId,
  parseReference,
  parseVerseId,
  verseIdToLabel,
} from "@/lib/bible/refs";

describe("BOOKS", () => {
  it("is the 66-book canon: 39 OT + 27 NT, 1,189 chapters", () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.filter((b) => b.testament === "OT")).toHaveLength(39);
    expect(BOOKS.reduce((sum, b) => sum + b.chapters, 0)).toBe(1189);
    expect(new Set(BOOKS.map((b) => b.code)).size).toBe(66);
    expect(BOOKS.map((b) => b.order)).toEqual(
      Array.from({ length: 66 }, (_, i) => i + 1),
    );
  });

  it("has unique aliases across books", () => {
    const seen = new Map<string, string>();
    for (const book of BOOKS) {
      for (const key of [book.code, book.name, ...book.aliases]) {
        const norm = normalizeBookName(key);
        const owner = seen.get(norm);
        expect(
          owner === undefined || owner === book.code,
          `${key} used by ${owner} and ${book.code}`,
        ).toBe(true);
        seen.set(norm, book.code);
      }
    }
  });
});

describe("findBook", () => {
  it.each([
    ["John", "JHN"],
    ["jn", "JHN"],
    ["1 John", "1JN"],
    ["I John", "1JN"],
    ["First John", "1JN"],
    ["1jn", "1JN"],
    ["1 Cor.", "1CO"],
    ["II Corinthians", "2CO"],
    ["Psalm", "PSA"],
    ["Ps", "PSA"],
    ["Song of Solomon", "SNG"],
    ["Revelations", "REV"],
    ["PHP", "PHP"],
    ["Philemon", "PHM"],
  ])("%s -> %s", (input, code) => {
    expect(findBook(input)?.code).toBe(code);
  });

  it("returns undefined for unknown books", () => {
    expect(findBook("Hezekiah")).toBeUndefined();
  });
});

describe("verse ids", () => {
  it("parses and labels valid ids", () => {
    expect(parseVerseId("JHN.3.16")).toEqual({
      book: "JHN",
      chapter: 3,
      verse: 16,
    });
    expect(verseIdToLabel("1CO.13.4")).toBe("1 Corinthians 13:4");
    expect(bookByCode("1CO")?.name).toBe("1 Corinthians");
  });

  it("rejects unknown books and out-of-range chapters", () => {
    expect(isVerseId("XYZ.1.1")).toBe(false);
    expect(isVerseId("JUD.2.1")).toBe(false);
    expect(isVerseId("JHN.3")).toBe(false);
    expect(isVerseId("JHN.0.1")).toBe(false);
  });

  it("parseReference is a Phase 2 stub", () => {
    expect(() => parseReference("John 3:16")).toThrow(/not implemented/);
  });

  it.todo("parseReference: 'John 3:16-18' -> one range of three verses");
  it.todo("parseReference: 'Ps 23' -> whole chapter");
  it.todo("parseReference: '1 Cor 13:4, 7' -> two ranges");
});
