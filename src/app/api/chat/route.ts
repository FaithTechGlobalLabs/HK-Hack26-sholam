import { z } from "zod";
import { getDb, isDatabaseConfigured } from "@/db";
import { clip } from "@/lib/agent/context";
import { demoTurn } from "@/lib/agent/demo";
import { type AgentEvent, eventStream } from "@/lib/agent/events";
import {
  type FinishedTurn,
  runAgentTurn,
  shouldUseLiveAgent,
} from "@/lib/agent/harness";
import { LIMITS } from "@/lib/agent/limits";
import {
  admitTurn,
  reserveModelCall,
  visitorHashSecret,
  visitorKey,
} from "@/lib/agent/usage-limit";
import { usageStore } from "@/lib/agent/usage-store";
import { admitIosQuestion } from "@/lib/billing/access";
import { isCustomerId, isDeviceId } from "@/lib/billing/plans";
import { appendTurn, isChatId } from "@/lib/chat/store";
import {
  assistantContentFromTurn,
  userContent,
} from "@/lib/chat/stored-content";
import {
  formatCardForPrompt,
  rankFlashcards,
  toSummary,
} from "@/lib/flashcards/rank";
import { listFlashcards } from "@/lib/flashcards/repo";
import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";
import { currentUserId } from "@/lib/supabase/server";

const historyTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(LIMITS.request.maxHistoryItemChars),
});

const bodySchema = z.strictObject({
  chatId: z.string().max(100).optional(),
  message: z.string().trim().min(1).max(LIMITS.request.maxMessageChars),
  // Long chats are trimmed to the recent turns, never rejected for length.
  history: z
    .array(historyTurnSchema)
    .max(LIMITS.request.maxHistoryItems)
    .optional(),
});

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

/**
 * Streams one assistant turn as server-sent events (see lib/agent/events.ts).
 * Live OpenRouter guide when a key is present (unless SHOLAM_AGENT=demo).
 * Live turns are counted per visitor and against a global daily ceiling
 * (lib/agent/usage-limit.ts); over a limit the answer is a 429 with a
 * friendly `{ error }`. A signed-in person's answered turns are saved to
 * their account (lib/chat/store.ts) before `done`; demo and error turns
 * are not.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { message: string, chatId?: string, history?: [] }" },
      { status: 400 },
    );
  }
  const { chatId, message } = parsed.data;
  if (request.headers.get("x-shalom-client") === "ios") {
    const deviceId = request.headers.get("x-shalom-device");
    if (!isDeviceId(deviceId)) {
      return Response.json(
        { error: "The iOS app needs an x-shalom-device header." },
        { status: 400 },
      );
    }
    const customer = request.headers.get("x-shalom-customer");
    const allowance = await admitIosQuestion(
      deviceId,
      isCustomerId(customer) ? customer : null,
    );
    if (!allowance.ok) {
      return Response.json(
        {
          error: allowance.message,
          code: "plan_limit",
          used: allowance.used,
          limit: allowance.limit,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(allowance.retryAfterSec),
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }
  const history = (parsed.data.history ?? [])
    .slice(-LIMITS.client.historyTurns)
    .map((t) => ({
      role: t.role,
      content: clip(t.content.trim(), LIMITS.model.historyTurnChars),
    }))
    .filter((t) => t.content.length > 0);
  const mode = shouldUseLiveAgent();

  if (mode.live && mode.reason) {
    const reason = mode.reason;
    return new Response(
      eventStream(
        (async function* () {
          yield { type: "error" as const, message: reason };
        })(),
      ),
      { headers: SSE_HEADERS },
    );
  }

  if (!mode.live) {
    return new Response(eventStream(demoTurn(message)), {
      headers: SSE_HEADERS,
    });
  }

  const userId = await currentUserId();
  const store = usageStore();
  const allowance = await admitTurn(
    store,
    visitorKey(request.headers, userId, visitorHashSecret()),
  );
  if (!allowance.ok) {
    return Response.json(
      { error: allowance.message },
      {
        status: 429,
        headers: { "Retry-After": String(allowance.retryAfterSec) },
      },
    );
  }

  // Stop button, closed tab or dropped connection: abort the model call,
  // tool fetches and retry waits.
  const abort = new AbortController();
  const onClientGone = () => abort.abort();
  request.signal.addEventListener("abort", onClientGone, { once: true });

  let matchedCardLines: string[] = [];
  let matchedSummaries: ReturnType<typeof toSummary>[] = [];
  try {
    const cards = await listFlashcards({ limit: 200 });
    const ranked = rankFlashcards(cards, message, LIMITS.model.matchedCards);
    matchedCardLines = ranked.map((r) => formatCardForPrompt(r.card));
    matchedSummaries = ranked.map((r) => toSummary(r.card));
  } catch {
    matchedCardLines = [];
    matchedSummaries = [];
  }

  // What the answer showed besides its text, for the saved turn.
  const shown: { cards?: FlashcardSummary[]; proposal?: FlashcardDraft } = {};
  const saveTurn =
    userId && chatId && isChatId(chatId) && isDatabaseConfigured()
      ? async (turn: FinishedTurn) => {
          try {
            await appendTurn(getDb(), userId, chatId, [
              { role: "user", content: userContent(message) },
              {
                role: "assistant",
                content: assistantContentFromTurn(turn, shown),
              },
            ]);
          } catch (err) {
            // Another account's chat id, or the database is down: the
            // answer still reaches the browser, it just isn't saved.
            console.warn("[chat] turn not saved:", err);
          }
        }
      : undefined;

  const events = (async function* (): AsyncGenerator<AgentEvent> {
    try {
      if (matchedSummaries.length) {
        shown.cards = matchedSummaries;
        yield { type: "flashcards", cards: matchedSummaries };
      }
      for await (const event of runAgentTurn({
        chatId: chatId ?? crypto.randomUUID(),
        userId,
        userMessage: message,
        history,
        matchedCardLines,
        signal: abort.signal,
        reserveModelCall: () => reserveModelCall(store),
        onFinish: saveTurn,
      })) {
        if (event.type === "flashcards") shown.cards = event.cards;
        else if (event.type === "flashcard_proposal")
          shown.proposal = event.draft;
        yield event;
      }
    } finally {
      request.signal.removeEventListener("abort", onClientGone);
    }
  })();

  return new Response(eventStream(events, { onCancel: onClientGone }), {
    headers: SSE_HEADERS,
  });
}
