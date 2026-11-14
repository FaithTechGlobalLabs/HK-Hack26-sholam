import { z } from "zod";
import { demoTurn } from "@/lib/agent/demo";
import { eventStream } from "@/lib/agent/events";
import { runAgentTurn, shouldUseLiveAgent } from "@/lib/agent/harness";
import {
  formatCardForPrompt,
  rankFlashcards,
  toSummary,
} from "@/lib/flashcards/rank";
import { listFlashcards } from "@/lib/flashcards/repo";
import { currentUserId } from "@/lib/supabase/server";

const historyTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(8000),
});

const bodySchema = z.strictObject({
  chatId: z.string().optional(),
  message: z.string().trim().min(1).max(8000),
  history: z.array(historyTurnSchema).max(40).optional(),
});

/**
 * Streams one assistant turn as server-sent events (see lib/agent/events.ts).
 * Live OpenRouter guide when a key is present (unless SHOLAM_AGENT=demo).
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { message: string, chatId?: string, history?: [] }" },
      { status: 400 },
    );
  }
  const { chatId, message, history = [] } = parsed.data;
  const mode = shouldUseLiveAgent();

  if (mode.live && mode.reason) {
    const reason = mode.reason;
    return new Response(
      eventStream(
        (async function* () {
          yield { type: "error" as const, message: reason };
        })(),
      ),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  let matchedCardLines: string[] = [];
  let matchedSummaries: ReturnType<typeof toSummary>[] = [];
  if (mode.live) {
    try {
      const cards = await listFlashcards({ limit: 200 });
      const ranked = rankFlashcards(cards, message, 3);
      matchedCardLines = ranked.map((r) => formatCardForPrompt(r.card));
      matchedSummaries = ranked.map((r) => toSummary(r.card));
    } catch {
      matchedCardLines = [];
      matchedSummaries = [];
    }
  }

  const events = mode.live
    ? (async function* () {
        if (matchedSummaries.length) {
          yield {
            type: "flashcards" as const,
            cards: matchedSummaries,
          };
        }
        yield* runAgentTurn({
          chatId: chatId ?? crypto.randomUUID(),
          userId: await currentUserId(),
          userMessage: message,
          history,
          matchedCardLines,
        });
      })()
    : demoTurn(message);

  return new Response(eventStream(events), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
