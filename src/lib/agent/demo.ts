import type { AgentEvent, VerseRecord } from "./events";

/**
 * Scripted stream used by /api/chat until the real loop lands (Phase 2).
 * It exercises every UI path: tool status, verse chips, a flashcard hit and
 * a card proposal. Verse text is BSB, checked against the helloao.org BSB
 * API on 2026-11-14; the real app reads it from the `verses` table.
 */

const VERSES: VerseRecord[] = [
  {
    id: "JHN.14.27",
    label: "John 14:27",
    translation: "BSB",
    text: "Peace I leave with you; My peace I give to you. I do not give to you as the world gives. Do not let your hearts be troubled; do not be afraid.",
  },
  {
    id: "MAT.5.9",
    label: "Matthew 5:9",
    translation: "BSB",
    text: "Blessed are the peacemakers, for they will be called sons of God.",
  },
];

const ANSWER = `This is a **demo reply**: the real agent arrives in Phase 2. It shows how answers will look.

Jesus speaks of a peace that is His own gift, different from what the world offers: "Peace I leave with you; My peace I give to you" [John 14:27](verse:JHN.14.27). He also calls those who make peace blessed [Matthew 5:9](verse:MAT.5.9).

A citation the tools never fetched is marked unverified, like this one: [Psalm 23:1](verse:PSA.23.1).`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* demoTurn(
  userMessage: string,
): AsyncGenerator<AgentEvent> {
  yield {
    type: "tool_start",
    id: "demo-1",
    name: "lookup_verses",
    input: { references: ["John 14:27", "Matthew 5:9"] },
  };
  await sleep(250);
  yield { type: "verses", verses: VERSES };
  yield {
    type: "tool_result",
    id: "demo-1",
    name: "lookup_verses",
    ok: true,
    summary: "2 verses",
  };

  for (const word of ANSWER.split(/(?<= )/)) {
    yield { type: "text_delta", text: word };
    await sleep(12);
  }

  if (/card|trivia|fact/i.test(userMessage)) {
    yield {
      type: "flashcard_proposal",
      draft: {
        question:
          "Which Beatitude promises that peacemakers will be called sons of God?",
        answer: 'The seventh: "Blessed are the peacemakers."',
        refs: ["MAT.5.9"],
        category: "jesus",
        tone: "fact",
        difficulty: 2,
      },
    };
  }

  yield { type: "done", stopReason: "end_turn" };
}
