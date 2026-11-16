import { describe, expect, it } from "vitest";
import {
  checkAnswer,
  extractCitations,
  finalizeAnswer,
  linkPlainRefs,
  quoteMatches,
} from "@/lib/agent/citations";

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

// The answer text rebuilt from ios/Verification/native-api-live-smoke.sse
// (text_delta events joined), copied verbatim. The turn fetched 17 verses.
const JONAH_SMOKE =
  "Jonah was a prophet from Gath-hepher in Israel (2 Kings 14:25) whom God sent to preach against Nineveh, the capital of Assyria—Israel's brutal enemy. Instead of obeying, Jonah fled by ship toward Tarshish. A storm threatened the crew; they threw Jonah overboard, and God appointed a great fish to swallow him. After three days and nights inside it, Jonah prayed and was vomited onto dry land (Jonah 1:1–3, 17). He then went to Nineveh and announced judgment; the whole city—from the king down—repented, and God relented (Jonah 3:1–10). Jesus later treated Jonah's three days in the fish as a sign pointing to his own death and resurrection (Matthew 12:39–41).\n\nThe book isn't mainly about the fish; it's about a prophet who wanted justice for his enemies but struggled when God showed them mercy instead.\n\nIf you want to dig into the \"three days\" question or the deeper point about mercy for enemies, there's a Shalom card on that: [Could Jonah really have survived inside a giant fish?](/flashcards?card=e256cec8-3799-44e0-ab92-9329e4fe4d9f)";
const FLASHCARD_LINK =
  "[Could Jonah really have survived inside a giant fish?](/flashcards?card=e256cec8-3799-44e0-ab92-9329e4fe4d9f)";
const JONAH_SEEN_IDS = [
  "JON.1.1",
  "JON.1.2",
  "JON.1.3",
  "JON.1.17",
  ...Array.from({ length: 10 }, (_, i) => `JON.3.${i + 1}`),
  "MAT.12.39",
  "MAT.12.40",
  "MAT.12.41",
];
const ids = (list: string[]) =>
  new Map(list.map((id) => [id, { text: `text of ${id}` }]));
const linked = (markdown: string) => linkPlainRefs(markdown).text;

describe("finalizeAnswer", () => {
  it("links the saved Jonah answer and lists the unfetched reference", () => {
    expect(JONAH_SEEN_IDS).toHaveLength(17);
    const { text, check } = finalizeAnswer(JONAH_SMOKE, ids(JONAH_SEEN_IDS));
    expect(text).toContain("([2 Kings 14:25](verse:2KI.14.25)) whom God sent");
    expect(text).toContain("([Jonah 1:1–3, 17](verse:JON.1.1)).");
    expect(text).toContain("([Jonah 3:1–10](verse:JON.3.1)).");
    expect(text).toContain("([Matthew 12:39–41](verse:MAT.12.39)).");
    expect(text).toContain(FLASHCARD_LINK);
    expect(text).toContain('the "three days" question');
    expect(check.citations).toEqual([
      { label: "2 Kings 14:25", verseId: "2KI.14.25" },
      { label: "Jonah 1:1–3, 17", verseId: "JON.1.1" },
      { label: "Jonah 3:1–10", verseId: "JON.3.1" },
      { label: "Matthew 12:39–41", verseId: "MAT.12.39" },
    ]);
    expect(check.unverified).toEqual([
      { verseId: "2KI.14.25", label: "2 Kings 14:25", reason: "not_fetched" },
    ]);
    expect(check.quoteIssues).toEqual([]);
    // Only the links were added: removing them gives back the raw text.
    expect(text.replace(/\[([^\]]+)\]\(verse:[^)]+\)/g, "$1")).toBe(
      JONAH_SMOKE,
    );
  });

  it("does not verify a range or list unless every verse in it was fetched", () => {
    const partial = JONAH_SEEN_IDS.filter((id) => id !== "JON.1.17");
    expect(finalizeAnswer(JONAH_SMOKE, ids(partial)).check.unverified).toEqual([
      { verseId: "2KI.14.25", label: "2 Kings 14:25", reason: "not_fetched" },
      {
        verseId: "JON.1.1",
        label: "Jonah 1:1–3, 17",
        reason: "not_fetched",
      },
    ]);
    const middle = JONAH_SEEN_IDS.filter((id) => id !== "JON.3.5");
    expect(
      finalizeAnswer(JONAH_SMOKE, ids(middle)).check.unverified.map(
        (u) => u.verseId,
      ),
    ).toEqual(["2KI.14.25", "JON.3.1"]);
    const complete = finalizeAnswer(
      "God relented (Jonah 3:1–10).",
      ids(JONAH_SEEN_IDS),
    );
    expect(complete.check.unverified).toEqual([]);
  });

  it("is idempotent: already-linked text gains nothing", () => {
    const once = finalizeAnswer(JONAH_SMOKE, ids(JONAH_SEEN_IDS)).text;
    expect(linkPlainRefs(once)).toEqual({ text: once, added: [] });
    expect(finalizeAnswer(once, ids(JONAH_SEEN_IDS)).text).toBe(once);
  });

  it("gives the same text and coverage verdicts on already-linked text", () => {
    // Same seen map, partial evidence for two of the four references.
    const partial = ids(
      JONAH_SEEN_IDS.filter((id) => id !== "JON.1.17" && id !== "MAT.12.41"),
    );
    const first = finalizeAnswer(JONAH_SMOKE, partial);
    const second = finalizeAnswer(first.text, partial);
    expect(second.text).toBe(first.text);
    expect(second.check.citations).toEqual(first.check.citations);
    expect(second.check.unverified).toEqual(first.check.unverified);
    expect(first.check.unverified).toEqual([
      { verseId: "2KI.14.25", label: "2 Kings 14:25", reason: "not_fetched" },
      { verseId: "JON.1.1", label: "Jonah 1:1–3, 17", reason: "not_fetched" },
      {
        verseId: "MAT.12.39",
        label: "Matthew 12:39–41",
        reason: "not_fetched",
      },
    ]);
  });

  it("does not verify a model-written range or list link from its first verse", () => {
    const answer =
      "Jonah ran ([Jonah 1:1–3, 17](verse:JON.1.1)) and Nineveh repented ([Jonah 3:1-10](verse:JON.3.1)).";
    const partial = ids(
      JONAH_SEEN_IDS.filter((id) => id !== "JON.1.17" && id !== "JON.3.10"),
    );
    const result = finalizeAnswer(answer, partial);
    expect(result.text).toBe(answer);
    expect(result.check.unverified).toEqual([
      { verseId: "JON.1.1", label: "Jonah 1:1–3, 17", reason: "not_fetched" },
      { verseId: "JON.3.1", label: "Jonah 3:1-10", reason: "not_fetched" },
    ]);
    // checkAnswer alone (quote pairing and the correction trigger) is unchanged.
    expect(checkAnswer(answer, partial).unverified).toEqual([]);
    expect(
      finalizeAnswer(answer, ids(JONAH_SEEN_IDS)).check.unverified,
    ).toEqual([]);
  });

  it("never verifies a model link whose label names verses it cannot list", () => {
    const all = ids([
      ...JONAH_SEEN_IDS,
      "GEN.1.1",
      "PSA.23.1",
      "JON.2.1",
      "JON.1.2",
    ]);
    const cases = [
      ["[Genesis 1:1–2:3](verse:GEN.1.1)", "GEN.1.1"],
      ["[Psalm 23](verse:PSA.23.1)", "PSA.23.1"],
      ["[Jonah 1:1–3, 17 (BSB)](verse:JON.1.1)", "JON.1.1"],
      ["[Jonah 1:1, 2:1](verse:JON.1.1)", "JON.1.1"],
      ["[Jonah 1:2–3](verse:JON.1.1)", "JON.1.1"],
    ] as const;
    for (const [answer, verseId] of cases)
      expect(
        finalizeAnswer(answer, all).check.unverified.map((u) => u.verseId),
        answer,
      ).toEqual([verseId]);
    for (const answer of ["[John 3:16](verse:JHN.3.16)"]) {
      expect(
        finalizeAnswer(answer, ids(["JHN.3.16", "MAT.5.3"])).check.unverified,
        answer,
      ).toEqual([]);
      expect(
        finalizeAnswer(answer, ids([])).check.unverified,
        answer,
      ).toHaveLength(1);
    }
    for (const answer of [
      "[John 3:16 (BSB)](verse:JHN.3.16)",
      "[馬太福音 5:3](verse:MAT.5.3)",
    ]) {
      expect(
        finalizeAnswer(answer, ids(["JHN.3.16", "MAT.5.3"])).check.unverified,
        answer,
      ).toHaveLength(1);
    }
    // Opaque text without reference numbers can still stand for the target.
    expect(
      finalizeAnswer("[this verse](verse:JHN.3.16)", ids(["JHN.3.16"])).check
        .unverified,
    ).toEqual([]);
  });

  it("never verifies a link whose English label names a different book", () => {
    // John's text must not show under a Romans label.
    const fetched = ids(["JHN.3.16"]);
    for (const answer of [
      "[Romans 8:28](verse:JHN.3.16)",
      "[Rom. 8:28 (BSB)](verse:JHN.3.16)",
      "[the promise in Romans 8:28](verse:JHN.3.16)",
      "[Romans 8](verse:JHN.3.16)",
    ]) {
      const label = answer.slice(1, answer.indexOf("]"));
      expect(finalizeAnswer(answer, fetched).check.unverified, answer).toEqual([
        { verseId: "JHN.3.16", label, reason: "not_fetched" },
      ]);
    }
    // checkAnswer (quote pairing, correction trigger) is unchanged.
    expect(
      checkAnswer("[Romans 8:28](verse:JHN.3.16)", fetched).unverified,
    ).toEqual([]);
  });

  it("keeps quote pairing on the raw text", () => {
    // Mismatched words after a plain reference are still caught...
    const nkjv =
      '"And we know that all things work together for good to those who love God, to those who are the called according to His purpose." (Romans 8:28, BSB)';
    const result = finalizeAnswer(nkjv, seen("ROM.8.28"));
    expect(result.text).toBe(
      '"And we know that all things work together for good to those who love God, to those who are the called according to His purpose." ([Romans 8:28](verse:ROM.8.28), BSB)',
    );
    expect(result.check.quoteIssues).toMatchObject([
      { verseId: "ROM.8.28", reason: "quote_mismatch", linked: false },
    ]);
    expect(result.check.unverified).toEqual([
      { verseId: "ROM.8.28", label: "Romans 8:28", reason: "quote_mismatch" },
    ]);
    // ...and the raw check (the rewrite trigger) does not pair a plain
    // reference that starts the next sentence. Once linked it does pair;
    // that only adds a failure, never a verification.
    const next =
      '"God works all things together for the good" 1 Peter 3:21 says more.';
    expect(checkAnswer(next, seen("ROM.8.28")).quoteIssues).toEqual([]);
    const after = finalizeAnswer(next, seen("ROM.8.28"));
    expect(after.text).toContain("[1 Peter 3:21](verse:1PE.3.21) says");
    expect(after.check.quoteIssues).toMatchObject([
      { verseId: "1PE.3.21", reason: "not_fetched", linked: true },
    ]);
    expect(after.check.unverified).toEqual([
      { verseId: "1PE.3.21", label: "1 Peter 3:21", reason: "not_fetched" },
    ]);
  });

  // BSB text, local to these tests.
  const JOHN = new Map([
    [
      "JHN.3.16",
      {
        text: "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.",
      },
    ],
    [
      "JHN.3.17",
      {
        text: "For God did not send His Son into the world to condemn the world, but to save the world through Him.",
      },
    ],
    ["ROM.8.28", { text: BSB["ROM.8.28"] }],
  ]);
  const only = (...keep: string[]) =>
    new Map([...JOHN].filter(([id]) => keep.includes(id)));

  it("flags a quote a link would pair with even when the raw text did not", () => {
    const answer =
      'Jesus said, "God helps those who help themselves," John 3:16.';
    expect(checkAnswer(answer, only("JHN.3.16")).quoteIssues).toEqual([]);
    const { text, check } = finalizeAnswer(answer, only("JHN.3.16"));
    expect(text).toBe(
      'Jesus said, "God helps those who help themselves," [John 3:16](verse:JHN.3.16).',
    );
    expect(check.unverified).toEqual([
      { verseId: "JHN.3.16", label: "John 3:16", reason: "quote_mismatch" },
    ]);
  });

  it("checks every reference next to a quote against its own verses", () => {
    const fetched = only("JHN.3.16", "ROM.8.28");
    const neither = finalizeAnswer(
      'John 3:16 says "the Lord is my shepherd always" (Romans 8:28).',
      fetched,
    );
    expect(neither.check.unverified).toEqual([
      { verseId: "JHN.3.16", label: "John 3:16", reason: "quote_mismatch" },
      { verseId: "ROM.8.28", label: "Romans 8:28", reason: "quote_mismatch" },
    ]);
    // John's words do not verify Romans.
    const johns = finalizeAnswer(
      'John 3:16 says "God so loved the world" (Romans 8:28).',
      fetched,
    );
    expect(johns.check.unverified).toEqual([
      { verseId: "ROM.8.28", label: "Romans 8:28", reason: "quote_mismatch" },
    ]);
    // The rewrite trigger keeps its old, lenient pairing.
    expect(
      checkAnswer(
        'John 3:16 says "God so loved the world" (Romans 8:28).',
        fetched,
      ).quoteIssues,
    ).toEqual([]);
  });

  it("never verifies a quote with the text of a verse outside the cited range", () => {
    const answer =
      '"God did not send His Son into the world to condemn the world" (John 3:16)';
    const fetched = only("JHN.3.16", "JHN.3.17");
    // checkAnswer allows one neighbouring verse; the final check does not.
    expect(checkAnswer(answer, fetched).quoteIssues).toEqual([]);
    expect(finalizeAnswer(answer, fetched).check.unverified).toEqual([
      { verseId: "JHN.3.16", label: "John 3:16", reason: "quote_mismatch" },
    ]);
    const linkedAnswer =
      '"God did not send His Son into the world to condemn the world" [John 3:16](verse:JHN.3.16)';
    expect(finalizeAnswer(linkedAnswer, fetched).check.unverified).toEqual([
      { verseId: "JHN.3.16", label: "John 3:16", reason: "quote_mismatch" },
    ]);
    // Within the cited range it is fine.
    expect(
      finalizeAnswer(answer.replace("John 3:16", "John 3:16–17"), fetched).check
        .unverified,
    ).toEqual([]);
  });

  it("keeps emphasis, unknown-book and open-ended labels conservative", () => {
    for (const label of [
      "**John 3:16-18**",
      "Juan 3:16-18",
      "Joh 3:16-18",
      "John 3:16ff",
      "John 3:16a",
      "see John 3:17 too",
      "Juan 3:17",
      "John 3:16 and 4:1",
    ]) {
      const answer = `[${label}](verse:JHN.3.16)`;
      expect(
        finalizeAnswer(answer, only("JHN.3.16")).check.unverified,
        label,
      ).toEqual([{ verseId: "JHN.3.16", label, reason: "not_fetched" }]);
    }
    for (const label of ["**John 3:16**", "Juan 3:16", "1 Johannes 3:16"]) {
      const target = label.startsWith("1 ") ? "1JN.3.16" : "JHN.3.16";
      expect(
        finalizeAnswer(
          `[${label}](verse:${target})`,
          new Map([[target, { text: "x" }]]),
        ).check.unverified,
        label,
      ).toEqual(
        label === "**John 3:16**"
          ? []
          : [{ verseId: target, label, reason: "not_fetched" }],
      );
    }
  });

  it("lets quote_mismatch win over not_fetched for the same verse", () => {
    // ROM.8.28 was fetched but 8:29 was not: the label is incomplete
    // (not_fetched) and its quote differs (quote_mismatch).
    const answer =
      '"all things work together for good to them that love God" (Romans 8:28–29)';
    const { check } = finalizeAnswer(answer, seen("ROM.8.28"));
    expect(check.unverified).toEqual([
      {
        verseId: "ROM.8.28",
        label: "Romans 8:28–29",
        reason: "quote_mismatch",
      },
    ]);
    // One entry per verse id: an earlier incomplete label for the same verse
    // takes the mismatch found at a later reference.
    const twice = finalizeAnswer(
      `Romans 8:28–29 matters. Later: "all things work together for good to them that love God" (Romans 8:28)`,
      seen("ROM.8.28"),
    );
    expect(twice.check.unverified).toEqual([
      {
        verseId: "ROM.8.28",
        label: "Romans 8:28–29",
        reason: "quote_mismatch",
      },
    ]);
  });

  it("checks only the evidence it is given", () => {
    const answer = "Paul says so (Romans 8:28).";
    expect(finalizeAnswer(answer, seen()).check.unverified).toEqual([
      { verseId: "ROM.8.28", label: "Romans 8:28", reason: "not_fetched" },
    ]);
    expect(finalizeAnswer(answer, seen("ROM.8.28")).check.unverified).toEqual(
      [],
    );
  });
});

describe("linkPlainRefs", () => {
  const unchanged = [
    ["an existing verse link", "See [John 3:16](verse:JHN.3.16) today."],
    ["another link's label", "Read [why John 3:16 matters](/notes/1)."],
    ["a link URL", "Read [this](https://example.com/John 3:16) now."],
    ["an image", "![Romans 8:28 painted](/img/rom.png)"],
    ["bracket text", "A note [compare John 3:16] here."],
    ["a footnote-style bracket", "Text[^John 3:16] here."],
    ["a reference before ]", "Odd John 3:16] here."],
    ["an unclosed [ earlier", "A [stray bracket, then John 3:16 here."],
    ["a reference after !", "Wow!John 3:16 is short."],
    ["inline code", "Type `John 3:16` to search."],
    ["a code fence", "```\nJohn 3:16\n```"],
    ["a bare URL", "See https://bible.example/John%203:16 now."],
    ["an autolink", "See <https://example.com/John 3:16> now."],
    ["an HTML tag", 'Hi <span title="John 3:16">there</span>.'],
    ["a reference definition", "[ref]: John 3:16 is here"],
    ["a curly quote", "He wrote “as in John 3:16 we read” once."],
    ["a straight quote", 'He wrote "as in John 3:16 we read" once.'],
    ["a blockquote", "> For God so loved the world — John 3:16"],
    ["a chapter-only reference", "Read Psalm 23 and John 9."],
    ["a one-chapter book without a colon", "Jude 11 warns us."],
    ["a cross-chapter range", "Read Genesis 1:1–2:3 slowly."],
    ["a cross-chapter list", "See Jonah 1:1, 4:2 together."],
    ["a semicolon chapter list", "See John 3:16; 4:1 together."],
    ["a partial verse", "Romans 8:28a says it."],
    ["a decimal-looking verse", "John 3:16.5 is not a verse."],
    ["an unknown book", "Hezekiah 3:16 is not a book."],
    ["a chapter past the book's end", "Jonah 9:1 does not exist."],
    ["a range longer than one lookup", "Read Psalm 119:1–176 slowly."],
    ["a range that runs backwards", "Read John 3:16–2 slowly."],
    ["non-English text", "請讀約翰福音 3:16。"],
  ] as const;
  for (const [name, input] of unchanged)
    it(`leaves ${name} alone`, () => {
      expect(linkPlainRefs(input)).toEqual({ text: input, added: [] });
    });

  it("does not merge a following reference into a verse list", () => {
    expect(linked("(Jonah 1:17, 2 Kings 14:25, BSB)")).toBe(
      "([Jonah 1:17](verse:JON.1.17), [2 Kings 14:25](verse:2KI.14.25), BSB)",
    );
    // A number followed by a word may not be a verse: the reference before
    // it is left whole rather than half-linked.
    expect(linkPlainRefs("Jonah 1:1, 17 and Jonah 2:1").added).toEqual([
      { verseId: "JON.2.1", label: "Jonah 2:1", verses: ["JON.2.1"] },
    ]);
    expect(linkPlainRefs("Jonah 1:1, 10 times over")).toEqual({
      text: "Jonah 1:1, 10 times over",
      added: [],
    });
    expect(linked("Jonah 1:1–3, 17, and more")).toBe(
      "[Jonah 1:1–3, 17](verse:JON.1.1), and more",
    );
  });

  it("protects every kind of Markdown code", () => {
    for (const input of [
      "Type ``John 3:16`` here.",
      "Type `` a ` John 3:16 `` here.",
      "~~~\nJohn 3:16\n~~~",
      "````\n```\nJohn 3:16\n````",
      "~~~ unclosed\nJohn 3:16",
      "Intro.\n\n    John 3:16 in indented code",
      "\tJohn 3:16 after a tab",
    ])
      expect(linkPlainRefs(input), input).toEqual({ text: input, added: [] });
    // Text after a closed fence is still linked, and the fence is unchanged.
    expect(linked("~~~\ncode\n~~~\nJohn 3:16")).toBe(
      "~~~\ncode\n~~~\n[John 3:16](verse:JHN.3.16)",
    );
  });

  it("protects fences in list items and mid-line runs, and links after them", () => {
    // Reviewer cases, exactly: the closing fence must not open a new one.
    expect(
      linked("1. ```\n   John 3:16\n   ```\n\nThen Romans 8:28 applies."),
    ).toBe(
      "1. ```\n   John 3:16\n   ```\n\nThen [Romans 8:28](verse:ROM.8.28) applies.",
    );
    expect(linked("- ```\n  John 3:16\n  ```\n\nAlso Romans 8:28.")).toBe(
      "- ```\n  John 3:16\n  ```\n\nAlso [Romans 8:28](verse:ROM.8.28).",
    );
    expect(linkPlainRefs("Example ```\nJohn 3:16\n```")).toEqual({
      text: "Example ```\nJohn 3:16\n```",
      added: [],
    });
    expect(linked("Example ```\nJohn 3:16\n```\n\nThen Romans 8:28.")).toBe(
      "Example ```\nJohn 3:16\n```\n\nThen [Romans 8:28](verse:ROM.8.28).",
    );
    // Same paragraph, after the run closes, is linkable too.
    expect(linked("Run ``` John 3:16 ``` then Romans 8:28.")).toBe(
      "Run ``` John 3:16 ``` then [Romans 8:28](verse:ROM.8.28).",
    );
    // A list fence with a blank line inside is still one code block.
    expect(
      linked("1. ```\n   John 3:16\n\n   John 3:17\n   ```\n\nRomans 8:28"),
    ).toBe(
      "1. ```\n   John 3:16\n\n   John 3:17\n   ```\n\n[Romans 8:28](verse:ROM.8.28)",
    );
    // Nested list marker, tilde fence.
    expect(linked("- 1. ~~~\n     John 3:16\n     ~~~\nRomans 8:28")).toBe(
      "- 1. ~~~\n     John 3:16\n     ~~~\n[Romans 8:28](verse:ROM.8.28)",
    );
    // An unmatched mid-line run is literal: no code, nothing hidden.
    expect(linked("Odd ``` mark.\n\nJohn 3:16")).toBe(
      "Odd ``` mark.\n\n[John 3:16](verse:JHN.3.16)",
    );
    // A run never closes across a blank line.
    expect(linked("A `tick\n\nJohn 3:16 and `x`")).toBe(
      "A `tick\n\n[John 3:16](verse:JHN.3.16) and `x`",
    );
  });

  it("expands ranges and lists to every cited verse", () => {
    expect(linkPlainRefs("(Jonah 1:1–3, 17)").added).toEqual([
      {
        verseId: "JON.1.1",
        label: "Jonah 1:1–3, 17",
        verses: ["JON.1.1", "JON.1.2", "JON.1.3", "JON.1.17"],
      },
    ]);
    expect(linkPlainRefs("1 Cor. 13:4 - 7").added).toEqual([
      {
        verseId: "1CO.13.4",
        label: "1 Cor. 13:4 - 7",
        verses: ["1CO.13.4", "1CO.13.5", "1CO.13.6", "1CO.13.7"],
      },
    ]);
  });

  it("keeps surrounding Markdown intact", () => {
    expect(linked("**John 3:16** and *Romans 8:28*.")).toBe(
      "**[John 3:16](verse:JHN.3.16)** and *[Romans 8:28](verse:ROM.8.28)*.",
    );
    expect(linked("- John 3:16\n- Song of Songs 2:4")).toBe(
      "- [John 3:16](verse:JHN.3.16)\n- [Song of Songs 2:4](verse:SNG.2.4)",
    );
    expect(linked("| Ref | Note |\n|---|---|\n| John 3:16 | love |")).toBe(
      "| Ref | Note |\n|---|---|\n| [John 3:16](verse:JHN.3.16) | love |",
    );
    // Code before the reference keeps its exact text.
    expect(linked("`x` then John 3:16")).toBe(
      "`x` then [John 3:16](verse:JHN.3.16)",
    );
    // Every added link is one the clients read back as a citation.
    const text = linked("Jonah 1:1–3, 17; [x](verse:JON.2.1) and John 3:16");
    expect(extractCitations(text)).toEqual([
      { label: "Jonah 1:1–3, 17", verseId: "JON.1.1" },
      { label: "x", verseId: "JON.2.1" },
      { label: "John 3:16", verseId: "JHN.3.16" },
    ]);
  });
});

describe("numbered-book citation identity", () => {
  it("does not borrow Gospel evidence for formatted or compact numbered names", () => {
    for (const [label, target] of [
      ["**First John** 3:16", "JHN.3.16"],
      ["**First** John 3:16", "JHN.3.16"],
      ["**I John** 3:16", "JHN.3.16"],
      ["**I** John 3:16", "JHN.3.16"],
      ["**IV** John 3:16", "JHN.3.16"],
      ["ICor 13:4", "JHN.13.4"],
      ["IIChronicles 3:16", "JHN.3.16"],
      ["Eleventh John 3:16 (BSB)", "JHN.3.16"],
    ]) {
      const raw = `[${label}](verse:${target})`;
      const result = finalizeAnswer(
        raw,
        new Map([[target, { text: "Synthetic identity fixture" }]]),
      );
      expect(result.check.unverified, raw).toContainEqual({
        verseId: target,
        label,
        reason: "not_fetched",
      });
    }
  });

  it("does not reinterpret an ordered-list marker as a numbered book", () => {
    const raw = "1. John 3:16\n2. John 3:17";
    expect(linkPlainRefs(raw).text).toBe(
      "1. [John 3:16](verse:JHN.3.16)\n2. [John 3:17](verse:JHN.3.17)",
    );
    for (const reference of [
      "John 1:1–2 kings 14:25",
      "John 1:1–2kings 14:25",
    ]) {
      expect(linkPlainRefs(reference), reference).toEqual({
        text: reference,
        added: [],
      });
    }
  });

  it("leaves unsupported ordinal names whole instead of linking John", () => {
    for (const label of [
      "Twenty-first John 3:16",
      "Twenty first John 3:16",
      "Twenty and first John 3:16",
      "twenty-second John 1:5",
      "twenty-third John 1:5",
      "Onehundredandfirst John 3:16",
      "Eleventh John 3:16",
      "Twelfth John 3:16",
      "Thirteenth John 3:16",
      "Twentieth John 3:16",
      "Hundredth John 3:16",
      "Quintillionth John 3:16",
      "Nth John 3:16",
      "**First** John 3:16",
      "`First` John 3:16",
    ]) {
      const raw = `Read ${label}.`;
      expect(linkPlainRefs(raw), raw).toEqual({ text: raw, added: [] });
    }
  });

  const cases = [
    ["First John 3:16", "1JN.3.16", "JHN.3.16"],
    ["I John 3:16", "1JN.3.16", "JHN.3.16"],
    ["Second John 1:5", "2JN.1.5", "JHN.1.5"],
    ["II John 1:5", "2JN.1.5", "JHN.1.5"],
    ["Third John 1:5", "3JN.1.5", "JHN.1.5"],
    ["III John 1:5", "3JN.1.5", "JHN.1.5"],
  ] as const;
  // Deliberately synthetic strings, not Scripture or teaching text.
  const quote = "Synthetic numbered book fixture words";
  const otherQuote = "Synthetic other book fixture words";
  const evidence = (verseId: string, text = quote) =>
    new Map([[verseId, { text }]]);

  for (const [label, verseId, wrongId] of cases) {
    it(`links all of ${label} without borrowing evidence from John`, () => {
      const raw = `Read ${label}.`;
      const text = `Read [${label}](verse:${verseId}).`;
      expect(linkPlainRefs(raw)).toEqual({
        text,
        added: [{ verseId, label, verses: [verseId] }],
      });
      const wrong = finalizeAnswer(raw, evidence(wrongId));
      expect(wrong.text).toBe(text);
      expect(wrong.check.citations).toEqual([{ verseId, label }]);
      expect(wrong.check.unverified).toEqual([
        { verseId, label, reason: "not_fetched" },
      ]);
      expect(finalizeAnswer(raw, evidence(verseId)).check.unverified).toEqual(
        [],
      );
      expect(text.replace(/\[([^\]]+)\]\(verse:[^)]+\)/g, "$1")).toBe(raw);
      expect(linkPlainRefs(text)).toEqual({ text, added: [] });
    });

    it(`checks complete explicit ${label} labels, including fallback labels`, () => {
      for (const explicit of [
        label,
        `${label} (BSB)`,
        `**${label}**`,
        `the reference in ${label}`,
      ]) {
        const wrong = `[${explicit}](verse:${wrongId})`;
        expect(
          finalizeAnswer(wrong, evidence(wrongId)).check.unverified,
          wrong,
        ).toEqual([
          { verseId: wrongId, label: explicit, reason: "not_fetched" },
        ]);
        const correct = `[${explicit}](verse:${verseId})`;
        expect(
          finalizeAnswer(correct, evidence(verseId)).check.unverified,
          correct,
        ).toEqual(
          explicit === label || explicit === `**${label}**`
            ? []
            : [{ verseId, label: explicit, reason: "not_fetched" }],
        );
      }
    });

    it(`uses ${label}'s own book in raw and final quotation checks`, () => {
      for (const raw of [
        `"${quote}" (${label}).`,
        `${label} says, "${quote}".`,
      ]) {
        const expected = {
          verseId,
          label,
          reason: "not_fetched",
          linked: false,
        };
        expect(
          checkAnswer(raw, evidence(wrongId)).quoteIssues,
          raw,
        ).toMatchObject([expected]);
        expect(
          finalizeAnswer(raw, evidence(wrongId)).check.unverified,
          raw,
        ).toEqual([{ verseId, label, reason: "not_fetched" }]);
        expect(checkAnswer(raw, evidence(verseId)).quoteIssues, raw).toEqual(
          [],
        );
        expect(
          finalizeAnswer(raw, evidence(verseId)).check.unverified,
          raw,
        ).toEqual([]);
        const both = new Map([
          [wrongId, { text: quote }],
          [verseId, { text: otherQuote }],
        ]);
        expect(checkAnswer(raw, both).quoteIssues, raw).toMatchObject([
          { verseId, label, reason: "quote_mismatch", linked: false },
        ]);
        expect(finalizeAnswer(raw, both).check.unverified, raw).toEqual([
          { verseId, label, reason: "quote_mismatch" },
        ]);
      }
    });

    it(`keeps ${label}'s identity when linking adds a quote pairing`, () => {
      const raw = `"${quote}" ${label}.`;
      expect(checkAnswer(raw, evidence(wrongId)).quoteIssues).toEqual([]);
      const final = finalizeAnswer(raw, evidence(wrongId));
      expect(final.check.quoteIssues).toMatchObject([
        { verseId, label, reason: "not_fetched", linked: true },
      ]);
      expect(final.check.unverified).toEqual([
        { verseId, label, reason: "not_fetched" },
      ]);
    });
  }

  it("keeps numbered ranges subject to full coverage and exact-quote checks", () => {
    const raw = `"${otherQuote}" (First John 3:16–18).`;
    const partial = evidence("1JN.3.16", otherQuote);
    expect(finalizeAnswer(raw, partial).check.unverified).toEqual([
      {
        verseId: "1JN.3.16",
        label: "First John 3:16–18",
        reason: "not_fetched",
      },
    ]);
    const complete = new Map([
      ...partial,
      ["1JN.3.17", { text: quote }],
      ["1JN.3.18", { text: quote }],
    ]);
    expect(finalizeAnswer(raw, complete).check.unverified).toEqual([]);
    expect(
      finalizeAnswer(
        raw.replace(otherQuote, "Synthetic missing fixture words"),
        complete,
      ).check.unverified,
    ).toEqual([
      {
        verseId: "1JN.3.16",
        label: "First John 3:16–18",
        reason: "quote_mismatch",
      },
    ]);
  });

  it("uses canonical numbered aliases without changing ordinary John", () => {
    for (const [label, verseId] of [
      ["First Jn. 3:16", "1JN.3.16"],
      ["I. John 3:16", "1JN.3.16"],
      ["first John 3:16", "1JN.3.16"],
      ["first john 3:16", "1JN.3.16"],
      ["FIRST JOHN 3:16", "1JN.3.16"],
      ["First  John 3:16", "1JN.3.16"],
      ["1John 3:16", "1JN.3.16"],
      ["II Corinthians 13:4", "2CO.13.4"],
      ["Second Peter 1:5", "2PE.1.5"],
      ["John 3:16", "JHN.3.16"],
    ]) {
      const raw = `Read ${label}.`;
      const final = finalizeAnswer(raw, evidence(verseId));
      expect(final.text, raw).toBe(`Read [${label}](verse:${verseId}).`);
      expect(final.check.unverified, raw).toEqual([]);
    }
  });

  it("never links a suffix of unsupported or malformed numbered names", () => {
    for (const label of [
      "Fourth John 3:16",
      "IV John 3:16",
      "IV JOHN 3:16",
      "fourth john 3:16",
      "IIII John 3:16",
      "4 John 3:16",
      "1st John 3:16",
      "First II John 3:16",
      "First First John 3:16",
      "First-John 3:16",
      "II/John 3:16",
      "FirstJohn 3:16",
      "IJohn 3:16",
      "First\nJohn 3:16",
      "First Genesis 3:16",
      "Third Peter 3:16",
      "Second John 3:16",
      "III John 3:16",
    ]) {
      const raw = `Read ${label}.`;
      expect(linkPlainRefs(raw), label).toEqual({ text: raw, added: [] });
      expect(finalizeAnswer(raw, evidence("JHN.3.16")).text, label).toBe(raw);
      // These unsupported English labels must not fall back to the target.
      const explicit = `[${label} (BSB)](verse:JHN.3.16)`;
      expect(
        finalizeAnswer(explicit, evidence("JHN.3.16")).check.unverified,
        explicit,
      ).toEqual([
        { verseId: "JHN.3.16", label: `${label} (BSB)`, reason: "not_fetched" },
      ]);
      expect(
        checkAnswer(
          `"${quote}" (${label})`,
          evidence("JHN.3.16"),
        ).quoteIssues.some((issue) => issue.verseId === "JHN.3.16"),
        label,
      ).toBe(false);
    }
  });

  it("preserves code, URLs, brackets and existing numbered-reference links", () => {
    for (const raw of [
      "Type `First John 3:16` here.",
      "Type ``I John 3:16`` here.",
      "```\nII John 1:5\n```",
      "~~~\nThird John 1:5\n~~~",
      "    First John 3:16",
      "Read [First John 3:16](verse:1JN.3.16).",
      "Read [First John 3:16](/notes/1).",
      "Read [this](https://example.com/I John 3:16).",
      "Read <https://example.com/First John 3:16>.",
      "Read https://example.com/First%20John%203:16.",
      "Compare [I John 3:16] here.",
    ])
      expect(linkPlainRefs(raw), raw).toEqual({ text: raw, added: [] });
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
