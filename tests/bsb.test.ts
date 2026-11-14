import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  dbOn: false,
  rows: [] as unknown[][],
  execute: vi.fn(),
}));

vi.mock("@/db", () => ({
  isDatabaseConfigured: () => h.dbOn,
  getDb: () => ({ execute: h.execute }),
}));

const { lookupRanges, resetBsbCache, searchBibleText } = await import(
  "@/lib/bible/bsb"
);
const { parsePassageRef, parseReference, passageToVerseRanges } = await import(
  "@/lib/bible/refs"
);
const { LIMITS } = await import("@/lib/agent/limits");

const ranges = (ref: string) =>
  parseReference(ref).flatMap((p) => {
    const passage = parsePassageRef(p);
    return passage ? passageToVerseRanges(passage) : [];
  });

/** A helloao chapter with 31 verses. */
function chapterJson(book: string, chapter: number) {
  return {
    chapter: {
      number: chapter,
      content: Array.from({ length: 31 }, (_, i) => ({
        type: "verse",
        number: i + 1,
        text: `${book} ${chapter}:${i + 1} text`,
      })),
    },
  };
}

beforeEach(() => {
  resetBsbCache();
  h.dbOn = false;
  h.execute.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("verse source without a database (helloao fallback)", () => {
  it("caps a huge range: Genesis 1-50 fetches two chapters, not fifty", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const m = /\/([1-3]?[A-Z]{2,3})\/(\d+)\.simple\.json$/.exec(url);
      return Response.json(chapterJson(m?.[1] ?? "", Number(m?.[2])));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(ranges("Genesis 1-50")).toHaveLength(50);
    const verses = await lookupRanges(ranges("Genesis 1-50"), {
      maxVerses: 41,
    });
    expect(verses).toHaveLength(41);
    expect(verses.at(-1)?.id).toBe("GEN.2.10");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never touches more chapters than the per-lookup cap", async () => {
    const fetchMock = vi.fn(async () => Response.json(chapterJson("PSA", 1)));
    vi.stubGlobal("fetch", fetchMock);
    await lookupRanges(ranges("Psalm 1-150"), { maxVerses: 10_000 });
    expect(fetchMock).toHaveBeenCalledTimes(LIMITS.tools.chaptersPerLookup);
  });

  it("does not cache a failed chapter load", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail
          ? new Response("down", { status: 503 })
          : Response.json(chapterJson("JHN", 11)),
      ),
    );
    await expect(lookupRanges(ranges("John 11:25"))).rejects.toThrow(
      /Could not fetch Bible text/,
    );
    fail = false;
    expect((await lookupRanges(ranges("John 11:25"))).map((v) => v.id)).toEqual(
      ["JHN.11.25"],
    );
  });

  it("retries a failed search-index load after a pause instead of failing forever", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(searchBibleText({ query: "talking donkey" })).rejects.toThrow(
      /search index/,
    );
    await expect(searchBibleText({ query: "talking donkey" })).rejects.toThrow(
      /unavailable for a moment/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + LIMITS.tools.failedLoadRetryMs + 1));
    fetchMock.mockImplementation(
      async () =>
        Response.json({
          books: [
            {
              id: "NUM",
              chapters: Array.from({ length: 40 }, (_, c) =>
                chapterJson("NUM", c + 1),
              ),
            },
          ],
        }) as never,
    );
    const hits = await searchBibleText({ query: "NUM 22:28 text", limit: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("verse source with a database", () => {
  it("reads ranges from the verses table in one query, with no network call", async () => {
    h.dbOn = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    h.execute.mockResolvedValue([
      {
        book: "JHN",
        chapter: 3,
        verse: 16,
        text: "For God so loved the world…",
      },
      {
        book: "JHN",
        chapter: 3,
        verse: 17,
        text: "For God did not send His Son…",
      },
    ]);
    const verses = await lookupRanges(ranges("John 3:16-17"));
    expect(verses.map((v) => [v.id, v.label, v.translation])).toEqual([
      ["JHN.3.16", "John 3:16", "BSB"],
      ["JHN.3.17", "John 3:17", "BSB"],
    ]);
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches with all terms first, then fills with any-term matches", async () => {
    h.dbOn = true;
    h.execute
      .mockResolvedValueOnce([
        { book: "PHP", chapter: 4, verse: 7, text: "And the peace of God…" },
      ])
      .mockResolvedValueOnce([
        {
          book: "JHN",
          chapter: 14,
          verse: 27,
          text: "Peace I leave with you…",
        },
      ]);
    const hits = await searchBibleText({
      query: "peace that surpasses understanding",
      limit: 50,
    });
    expect(hits.map((v) => v.id)).toEqual(["PHP.4.7", "JHN.14.27"]);
    expect(h.execute).toHaveBeenCalledTimes(2);
  });
});
