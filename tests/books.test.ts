import { describe, expect, it } from "vitest";
import {
  BOOKS,
  bookByCode,
  findBook,
  normalizeBookName,
} from "@/lib/bible/books";
import {
  isPassageRef,
  isVerseId,
  parseReference,
  parseVerseId,
  passageLabel,
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

  it.each([
    ["John 3:16", ["JHN.3.16"]],
    ["John 3:16-18", ["JHN.3.16-JHN.3.18"]],
    ["Matthew 18:21–35", ["MAT.18.21-MAT.18.35"]],
    ["Genesis 1:1–2:3", ["GEN.1.1-GEN.2.3"]],
    ["Daniel 4", ["DAN.4"]],
    ["Hosea 1–3", ["HOS.1-HOS.3"]],
    ["Ps 23", ["PSA.23"]],
    ["1 Cor 13:4, 7", ["1CO.13.4", "1CO.13.7"]],
    ["Galatians 1:10, John 12:42–43", ["GAL.1.10", "JHN.12.42-JHN.12.43"]],
    ["John 12:1–8; Mark 14:3–9", ["JHN.12.1-JHN.12.8", "MRK.14.3-MRK.14.9"]],
    ["Romans 8:28; 12:1-2", ["ROM.8.28", "ROM.12.1-ROM.12.2"]],
  ])("parseReference(%s)", (input, expected) => {
    expect(parseReference(input)).toEqual(expected);
  });

  it("parseReference rejects unknown books and malformed parts", () => {
    expect(() => parseReference("Hezekiah 3:1")).toThrow(/Unknown book/);
    expect(() => parseReference("John 3:16-12")).toThrow(/Not a valid passage/);
    expect(() => parseReference("Jude 2")).toThrow(/Not a valid passage/);
  });

  it("labels passages", () => {
    expect(passageLabel("MAT.18.21-MAT.18.35")).toBe("Matthew 18:21–35");
    expect(passageLabel("GEN.1.1-GEN.2.3")).toBe("Genesis 1:1–2:3");
    expect(passageLabel("DAN.4")).toBe("Daniel 4");
    expect(passageLabel("GEN.1-GEN.2")).toBe("Genesis 1–2");
    expect(passageLabel("JHN.3.16")).toBe("John 3:16");
    expect(isPassageRef("JHN.3.16-JHN.3")).toBe(false);
    expect(isPassageRef("JHN.3.16-MAT.1.1")).toBe(false);
  });
});
