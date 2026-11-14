import { describe, expect, it } from "vitest";
import { checkAnswer, quoteMatches } from "@/lib/agent/citations";

// BSB text as imported into the `verses` table.
const BSB = {
  "ROM.8.28":
    "And we know that God works all things together for the good of those who love Him, who are called according to His purpose.",
  "EXO.3.6":
    "Then He said, “I am the God of your father, the God of Abraham, the God of Isaac, and the God of Jacob.” At this, Moses hid his face, for he was afraid to look at God.",
  "EXO.3.7":
    "The LORD said, “I have indeed seen the affliction of My people in Egypt. I have heard them crying out because of their oppressors, and I am aware of their sufferings.",
  "JHN.11.35": "Jesus wept.",
  "NUM.22.28":
    "Then the LORD opened the donkey’s mouth, and she said to Balaam, “What have I done to you that you have beaten me these three times?”",
};

const seen = (...ids: (keyof typeof BSB)[]) =>
  new Map(ids.map((id) => [id, { text: BSB[id] }]));

describe("checkAnswer", () => {
  it("verifies a cite fetched before the answer, with matching quoted words", () => {
    const answer =
      "God is at work even in pain: “God works all things together for the good of those who love Him” [Romans 8:28](verse:ROM.8.28).";
    const check = checkAnswer(answer, seen("ROM.8.28"));
    expect(check.unverified).toEqual([]);
    expect(check.quoteIssues).toEqual([]);
  });

  it("leaves a cite unverified when no tool fetched it", () => {
    const check = checkAnswer(
      "Jesus cried [John 11:35](verse:JHN.11.35).",
      seen(),
    );
    expect(check.unverified).toEqual([
      { verseId: "JHN.11.35", label: "John 11:35", reason: "not_fetched" },
    ]);
    expect(check.quoteIssues).toEqual([]);
  });

  it("flags a quote from memory (NKJV wording labelled BSB) with a plain reference", () => {
    // Production, 2026-11-14: the "memory-cite" case.
    const answer =
      '"And we know that all things work together for good to those who love God, to those who are the called according to His purpose." (Romans 8:28, BSB)';
    const fetched = checkAnswer(answer, seen("ROM.8.28"));
    expect(fetched.quoteIssues).toMatchObject([
      { verseId: "ROM.8.28", reason: "quote_mismatch", linked: false },
    ]);
    const unfetched = checkAnswer(answer, seen());
    expect(unfetched.quoteIssues).toMatchObject([
      { verseId: "ROM.8.28", reason: "not_fetched", linked: false },
    ]);
  });

  it("marks a fetched link unverified when its quote differs from the text", () => {
    const answer =
      '- "I am the God of your father, the God of Abraham, Isaac, and Jacob" [Exodus 3:6](verse:EXO.3.6).';
    const check = checkAnswer(answer, seen("EXO.3.6"));
    expect(check.unverified).toEqual([
      { verseId: "EXO.3.6", label: "Exodus 3:6", reason: "quote_mismatch" },
    ]);
  });

  it("accepts ellipses, curly quotes and a range label", () => {
    const answer =
      "God said, “I am the God of your father … the God of Jacob” and “I have indeed seen the affliction of My people” [Exodus 3:6-7](verse:EXO.3.6).";
    expect(checkAnswer(answer, seen("EXO.3.6", "EXO.3.7")).quoteIssues).toEqual(
      [],
    );
    expect(
      checkAnswer(
        "The donkey asked, “What have I done to you that you have beaten me these three times?” [Numbers 22:28](verse:NUM.22.28)",
        seen("NUM.22.28"),
      ).quoteIssues,
    ).toEqual([]);
  });

  it("checks a quote whose reference comes first in the same sentence", () => {
    const answer =
      '[Romans 8:28](verse:ROM.8.28) says, "all things work together for good".';
    expect(checkAnswer(answer, seen("ROM.8.28")).quoteIssues).toHaveLength(1);
  });

  it("ignores quotes with no reference next to them, code, and non-Latin text", () => {
    const answer = [
      'The card asks "Why do Christians get baptized, and what does it mean?" and you can open it.',
      '```python\nprint("hello world, sorted")  # Romans 8:28\n```',
      "「虛心的人有福了」[馬太福音 5:3](verse:MAT.5.3)",
    ].join("\n\n");
    const check = checkAnswer(answer, seen());
    expect(check.quoteIssues).toEqual([]);
    expect(check.unverified.map((c) => c.verseId)).toEqual(["MAT.5.3"]);
  });

  it("ties each quote in a list to the reference before it", () => {
    // Live check 2026-11-14 ("contested"): this draft was wrongly flagged.
    const text = {
      "MRK.16.16":
        "Whoever believes and is baptized will be saved, but whoever does not believe will be condemned.",
      "ACT.2.38":
        "Peter replied, “Repent and be baptized, every one of you, in the name of Jesus Christ for the forgiveness of your sins, and you will receive the gift of the Holy Spirit.",
      "1PE.3.21":
        "And this water symbolizes the baptism that now saves you also—not the removal of dirt from the body, but the pledge of a clear conscience toward God—through the resurrection of Jesus Christ.",
    };
    const fetched = new Map(
      Object.entries(text).map(([id, t]) => [id, { text: t }]),
    );
    const draft =
      '- **Baptism as necessary**: Passages like Mark 16:16 ("whoever believes and is baptized will be saved"), Acts 2:38 ("repent and be baptized…for the forgiveness of your sins"), and 1 Peter 3:21 ("baptism…now saves you") are read as stating that God normally works salvation *through* the water.';
    expect(checkAnswer(draft, fetched).quoteIssues).toEqual([]);
    const final =
      "Acts 2:38 says, “Repent and be baptized, every one of you, in the name of Jesus Christ for the forgiveness of your sins, and you will receive the gift of the Holy Spirit.” 1 Peter 3:21 says, “And this water symbolizes the baptism that now saves you also.”";
    expect(checkAnswer(final, fetched).quoteIssues).toEqual([]);
    const wrong = draft.replace("will be saved", "shall be saved");
    expect(checkAnswer(wrong, fetched).quoteIssues).toMatchObject([
      { verseId: "MRK.16.16", reason: "quote_mismatch" },
    ]);
  });

  it("does not tie a quote to a reference from the previous sentence", () => {
    const answer =
      'Paul says this in [Romans 8:28](verse:ROM.8.28). Later a friend said "everything happens for a reason".';
    expect(checkAnswer(answer, seen("ROM.8.28")).quoteIssues).toEqual([]);
  });
});

describe("quoteMatches", () => {
  it("ignores case, punctuation and apostrophe style but not words", () => {
    expect(quoteMatches("the donkey's mouth", BSB["NUM.22.28"])).toBe(true);
    expect(quoteMatches("the donkeys mouth", BSB["NUM.22.28"])).toBe(true);
    expect(quoteMatches("the mule's mouth", BSB["NUM.22.28"])).toBe(false);
    expect(quoteMatches("", BSB["NUM.22.28"])).toBe(false);
  });
});
