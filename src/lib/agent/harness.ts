/**
 * Shalom Guide: a manual streaming tool-use loop over OpenRouter
 * (OpenAI-compatible chat completions). We own the loop so the browser gets
 * typed custom events (verse chips, flashcard hits, proposals) with the text.
 *
 * Per turn: up to LIMITS.turn.maxModelCalls requests. Tools are offered for
 * up to maxToolRounds rounds while a call is left to answer with. A verse
 * counts as verified only if a tool returned it before the answer was
 * written; if the answer quotes Scripture no tool returned (or changes its
 * words), the server fetches those verses and asks for one rewrite, and the
 * browser swaps the draft for it (`reset`). Nothing fetched after the final
 * answer is ever shown as verified.
 */

import { lookupRanges } from "@/lib/bible/bsb";
import {
  parsePassageRef,
  parseReference,
  parseVerseId,
  passageToVerseRanges,
  type VerseRange,
} from "@/lib/bible/refs";
import {
  type AnswerCheck,
  type CitationIssue,
  checkAnswer,
  finalizeAnswer,
} from "./citations";
import {
  assemblePrompt,
  buildPromptParts,
  clipToolResult,
  type HistoryTurn,
  type PromptParts,
} from "./context";
import type { AgentEvent, VerseRecord } from "./events";
import { LIMITS } from "./limits";
import type { ChatMessage, ToolCall } from "./openai-types";
import { streamChatCompletion } from "./openrouter";
import {
  isAbort,
  OpenRouterError,
  openRouterConfig,
  shouldUseLiveAgent,
} from "./openrouter-config";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOLS, toolByName, toolDefinitions } from "./tools";
import type { ToolContext } from "./tools/types";

export interface AgentConfig {
  model: string;
  maxTokens: number;
  maxSteps: number;
}

export function agentConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const cfg = openRouterConfig(env);
  return {
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    maxSteps: cfg.maxSteps,
  };
}

export { shouldUseLiveAgent, SYSTEM_PROMPT, TOOLS };
export type { HistoryTurn };

export interface TurnInput {
  chatId: string;
  userId: string | null;
  userMessage: string;
  history?: HistoryTurn[];
  matchedCardLines?: string[];
  /** Aborts when the client stops; cancels model calls, tool fetches and retries. */
  signal?: AbortSignal;
  /** Asked before every model request; false means today's ceiling is reached. */
  reserveModelCall?: () => Promise<boolean>;
  /**
   * Called once when the turn ends with an answer, before `done` (the route
   * saves signed-in turns here). Errors are logged, never shown.
   */
  onFinish?: (turn: FinishedTurn) => Promise<void>;
}

/** An answered turn, as `onFinish` receives it. */
export interface FinishedTurn {
  /** The answer shown. */
  text: string;
  model: string;
  stopReason: string;
  /** What the model produced this turn, verbatim and in order: assistant
   * `tool_calls`, `tool` results, any rewrite exchange, the final answer. */
  messages: ChatMessage[];
  /**
   * Verse records the shown answer was judged against: those returned this
   * turn before it was written (for a restored draft, the evidence before
   * the correction fetch; `messages` still hold every tool result).
   */
  verses: VerseRecord[];
  /** The final citation check (same as the `citations` event). */
  citations: { unverified: CitationIssue[]; quoteWarnings: string[] };
}

/** Messages for the first model call of a turn (scripts and tests use it). */
export function buildMessages(input: {
  history: HistoryTurn[];
  userMessage: string;
  matchedCardLines?: string[];
}): ChatMessage[] {
  return assemblePrompt(buildPromptParts(input));
}

export const DAILY_CEILING_MESSAGE =
  "Shalom Guide has answered as many questions as it can for today. It resets at midnight UTC. Please come back then.";
const OUT_OF_STEPS =
  "Shalom Guide could not finish that answer. Please ask again, a little more simply.";

export async function* runAgentTurn(
  input: TurnInput,
): AsyncGenerator<AgentEvent> {
  const config = openRouterConfig();
  if (!config.apiKey) {
    yield {
      type: "error",
      message:
        "OPENROUTER_API_KEY is missing. Add it to .env.local and restart the dev server.",
    };
    return;
  }

  const { signal } = input;
  const parts = buildPromptParts({
    history: input.history ?? [],
    userMessage: input.userMessage,
    matchedCardLines: input.matchedCardLines,
  });
  const tools = toolDefinitions();
  const versesSeen = new Map<string, VerseRecord>();
  const pending: AgentEvent[] = [];
  const ctx: ToolContext = {
    userId: input.userId,
    translation: "BSB",
    emit: (event) => pending.push(event),
    versesSeen,
    signal,
  };
  function* drain(): Generator<AgentEvent> {
    while (pending.length) {
      const event = pending.shift();
      if (event) yield event;
    }
  }

  let calls = 0;
  let toolRounds = 0;
  /** The next model call was already counted (the rewrite reserves early). */
  let reserved = false;
  /**
   * Set while the one corrective rewrite runs. `seenAtDraft` is the evidence
   * the draft was written with, copied before the correction fetch, so a
   * restored draft is never upgraded by verses fetched after it.
   */
  let correction: {
    draft: string;
    seenAtDraft: ReadonlyMap<string, VerseRecord>;
  } | null = null;

  /**
   * The one place a turn ends with an answer. Here the final text, its
   * citation check, the verses fetched this turn (`versesSeen`) and
   * `input.userId` / `input.chatId` are all known: a step that saves the
   * turn belongs here. Error endings (`error` event) do not come here.
   *
   * `raw` is the model's answer as written; it stays in the model history
   * verbatim. The person sees (and `onFinish.text` stores) the display text
   * with plain references linked, judged against `seen`.
   */
  async function* finishTurn(
    raw: string,
    seen: ReadonlyMap<string, VerseRecord>,
    stopReason: string,
    restored = false,
  ): AsyncGenerator<AgentEvent> {
    const { text, check } = finalizeAnswer(raw, seen);
    if (restored) yield { type: "reset", reason: "restore", text };
    else if (text !== raw) yield { type: "reset", reason: "verse_links", text };
    const citations = citationsEvent(check);
    yield citations;
    if (input.onFinish) {
      try {
        await input.onFinish({
          text,
          model: config.model,
          stopReason,
          messages: [...parts.tail, { role: "assistant", content: raw }],
          verses: [...seen.values()],
          citations: {
            unverified: citations.unverified,
            quoteWarnings: citations.quoteWarnings,
          },
        });
      } catch (err) {
        console.warn("[harness] onFinish failed:", err);
      }
    }
    yield {
      type: "done",
      stopReason,
      messageId: crypto.randomUUID(),
    };
  }

  /** Ends the turn with the draft and its flags when the rewrite fails. */
  async function* restoreDraft(): AsyncGenerator<AgentEvent> {
    if (!correction) return;
    yield* finishTurn(
      correction.draft,
      correction.seenAtDraft,
      "end_turn",
      true,
    );
  }

  try {
    while (calls < LIMITS.turn.maxModelCalls) {
      if (signal?.aborted) return;
      const counted = reserved;
      reserved = false;
      if (
        !counted &&
        input.reserveModelCall &&
        !(await input.reserveModelCall())
      ) {
        if (correction) {
          yield* restoreDraft();
          return;
        }
        yield { type: "error", message: DAILY_CEILING_MESSAGE };
        return;
      }
      const callsLeft = LIMITS.turn.maxModelCalls - calls;
      calls += 1;
      const offerTools =
        !correction && toolRounds < LIMITS.turn.maxToolRounds && callsLeft >= 2;

      let text = "";
      let toolCalls: ToolCall[] = [];
      let finishReason: string | null = null;
      for await (const chunk of streamChatCompletion({
        messages: assemblePrompt(parts),
        // Always the same tool list, so the prompt prefix stays cacheable.
        tools,
        toolChoice: offerTools ? "auto" : "none",
        config,
        signal,
      })) {
        if (chunk.type === "text" && chunk.text) {
          text += chunk.text;
          yield { type: "text_delta", text: chunk.text };
        } else if (chunk.type === "tool_calls_done" && chunk.toolCalls) {
          toolCalls = chunk.toolCalls;
          finishReason = chunk.finishReason ?? "tool_calls";
        } else if (chunk.type === "done") {
          finishReason = chunk.finishReason ?? finishReason;
        }
      }

      if (toolCalls.length) {
        if (correction) {
          // The rewrite may not call tools.
          yield* restoreDraft();
          return;
        }
        // An answer that ends by drafting a card keeps its text: run the
        // draft tool and finish without another model call.
        const onlyDrafts =
          text.trim().length > 0 &&
          toolCalls.every((c) => c.function.name === "propose_flashcard");
        if (!onlyDrafts) {
          if (text) yield { type: "reset", reason: "tool_call" };
          if (calls >= LIMITS.turn.maxModelCalls) {
            yield { type: "error", message: OUT_OF_STEPS };
            return;
          }
        }
        toolRounds += 1;
        parts.tail.push({
          role: "assistant",
          content: null,
          tool_calls: toolCalls,
        });
        yield* executeToolCalls(toolCalls, ctx, parts, drain);
        if (!onlyDrafts) continue;
      }

      if (!text.trim()) {
        if (correction) {
          yield* restoreDraft();
          return;
        }
        yield { type: "error", message: OUT_OF_STEPS };
        return;
      }

      const check = checkAnswer(text, versesSeen);
      if (
        !correction &&
        check.quoteIssues.length > 0 &&
        calls < LIMITS.turn.maxModelCalls &&
        (!input.reserveModelCall || (await input.reserveModelCall()))
      ) {
        reserved = true;
        // The draft's evidence, before the correction fetch adds to it.
        const seenAtDraft = new Map(versesSeen);
        const plan = correctionPlan(check);
        let ids: string[] = [];
        if (plan.ranges.length) {
          yield {
            type: "tool_start",
            id: CHECK_ID,
            name: "lookup_verses",
            input: { references: plan.labels },
          };
          ids = await fetchForCorrection(plan.ranges, ctx);
          yield* drain();
        }
        if (ids.length) {
          correction = { draft: text, seenAtDraft };
          yield { type: "reset", reason: "verse_check" };
          parts.tail.push({ role: "assistant", content: text });
          parts.tail.push({
            role: "user",
            content: correctionNote(ids, versesSeen),
          });
          continue;
        }
      }

      yield* finishTurn(text, versesSeen, finishReason || "end_turn");
      return;
    }

    if (correction) {
      yield* restoreDraft();
      return;
    }
    yield { type: "error", message: OUT_OF_STEPS };
  } catch (err) {
    if (isAbort(err, signal)) return;
    if (correction) {
      yield* restoreDraft();
      return;
    }
    const message =
      err instanceof OpenRouterError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    yield { type: "error", message };
  }
}

function citationsEvent(
  check: AnswerCheck,
): Extract<AgentEvent, { type: "citations" }> {
  return {
    type: "citations",
    unverified: check.unverified,
    quoteWarnings: [
      ...new Set(
        check.quoteIssues.filter((q) => !q.linked).map((q) => q.label),
      ),
    ],
  };
}

async function* executeToolCalls(
  toolCalls: ToolCall[],
  ctx: ToolContext,
  parts: PromptParts,
  drain: () => Generator<AgentEvent>,
): AsyncGenerator<AgentEvent> {
  const reply = (id: string, content: string) =>
    parts.tail.push({
      role: "tool",
      tool_call_id: id,
      content: clipToolResult(content),
    });

  for (const call of toolCalls) {
    const name = call.function.name;
    const tool = toolByName(name);
    yield {
      type: "tool_start",
      id: call.id,
      name,
      input: safeParseArgs(call.function.arguments),
    };

    let failure: string | null = null;
    let validated: unknown;
    if (!tool) {
      failure = `Unknown tool: ${name}`;
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(call.function.arguments || "{}");
      } catch {
        failure = "Invalid tool arguments JSON";
      }
      if (!failure) {
        const result = tool.inputSchema.safeParse(parsed);
        if (result.success) validated = result.data;
        else failure = `Invalid input: ${result.error.message}`;
      }
    }
    if (failure || !tool) {
      const summary = failure ?? `Unknown tool: ${name}`;
      yield { type: "tool_result", id: call.id, name, ok: false, summary };
      reply(call.id, summary);
      continue;
    }

    try {
      const result = await tool.run(validated, ctx);
      yield* drain();
      yield {
        type: "tool_result",
        id: call.id,
        name,
        ok: true,
        summary: summarizeToolResult(name, result),
      };
      reply(call.id, result);
    } catch (err) {
      if (ctx.signal?.aborted) throw err;
      yield* drain();
      const summary = err instanceof Error ? err.message : "Tool failed";
      yield { type: "tool_result", id: call.id, name, ok: false, summary };
      reply(call.id, `Error: ${summary}`);
    }
  }
}

const CHECK_ID = "verse_check";

/** Ranges (quoted ones first) and labels for each problem citation. */
function correctionPlan(check: AnswerCheck): {
  ranges: VerseRange[];
  labels: string[];
} {
  const refs = [
    ...check.quoteIssues.map((q) => ({ label: q.label, verseId: q.verseId })),
    ...check.unverified.map((c) => ({ label: c.label, verseId: c.verseId })),
  ];
  const ranges: VerseRange[] = [];
  const keys = new Set<string>();
  for (const ref of refs) {
    const id = parseVerseId(ref.verseId);
    let found: VerseRange[] = [];
    try {
      found = parseReference(ref.label).flatMap((p) => {
        const passage = parsePassageRef(p);
        return passage ? passageToVerseRanges(passage) : [];
      });
    } catch {
      found = [];
    }
    if (!found.length || (id && found[0].book !== id.book)) {
      found = id
        ? [
            {
              book: id.book,
              chapter: id.chapter,
              verseStart: id.verse,
              verseEnd: id.verse,
            },
          ]
        : [];
    }
    for (const r of found) {
      const key = `${r.book}.${r.chapter}.${r.verseStart}.${r.verseEnd}`;
      if (keys.has(key)) continue;
      keys.add(key);
      ranges.push(r);
    }
  }
  return { ranges, labels: [...new Set(refs.map((r) => r.label))] };
}

/**
 * The server-side lookup_verses behind a corrective rewrite. Returns the
 * ids of the verses it could load (they count as fetched from here on).
 */
async function fetchForCorrection(
  ranges: VerseRange[],
  ctx: ToolContext,
): Promise<string[]> {
  try {
    const verses = await lookupRanges(ranges, {
      maxVerses: LIMITS.turn.correctionVerses,
      signal: ctx.signal,
    });
    const records = verses.map((v) => ({
      id: v.id,
      label: v.label,
      text: v.text,
      translation: v.translation,
    }));
    for (const r of records) ctx.versesSeen.set(r.id, r);
    if (records.length) ctx.emit({ type: "verses", verses: records });
    ctx.emit({
      type: "tool_result",
      id: CHECK_ID,
      name: "lookup_verses",
      ok: records.length > 0,
      summary: `${records.length} verse${records.length === 1 ? "" : "s"}`,
    });
    return records.map((r) => r.id);
  } catch (err) {
    if (ctx.signal?.aborted) throw err;
    ctx.emit({
      type: "tool_result",
      id: CHECK_ID,
      name: "lookup_verses",
      ok: false,
      summary: err instanceof Error ? err.message : "Lookup failed",
    });
    return [];
  }
}

function correctionNote(
  ids: string[],
  versesSeen: ReadonlyMap<string, VerseRecord>,
): string {
  const lines = ids
    .map((id) => versesSeen.get(id))
    .filter((v): v is VerseRecord => Boolean(v))
    .map((v) => `${v.id} | ${v.text}`);
  return [
    "[Verse check: the user did not write this. Do not mention it.]",
    "Your draft above quoted Scripture that no tool returned this turn, or changed its words. Here is the Berean Standard Bible text for the verses you used:",
    ...lines,
    "Rewrite your whole answer for the user, in the same language and no longer. Quote only these words, exactly as given, or say what a verse means without quotation marks. Keep the [Label](verse:ID) links. Do not quote any other verse.",
  ].join("\n");
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
}

function summarizeToolResult(name: string, result: string): string {
  const lines = result
    .split("\n")
    .filter((l) => /^[1-3]?[A-Z]{2,3}\.\d/.test(l)).length;
  if (name === "lookup_verses" || name === "search_bible")
    return `${lines} verse${lines === 1 ? "" : "s"}`;
  if (name === "search_flashcards") {
    if (result.startsWith("No strong")) return "no match";
    const cards = result.split("\n").filter(Boolean).length;
    return `${cards} card${cards === 1 ? "" : "s"}`;
  }
  if (name === "propose_flashcard") return "draft ready";
  return result.slice(0, 80);
}
