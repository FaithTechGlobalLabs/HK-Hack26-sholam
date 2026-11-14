/**
 * Shalom Guide: a manual streaming tool-use loop over OpenRouter
 * (OpenAI-compatible chat completions). We own the loop so the browser gets
 * typed custom events (verse chips, flashcard hits, proposals) with the text.
 */

import { lookupRanges } from "@/lib/bible/bsb";
import { parseVerseId, verseIdToLabel } from "@/lib/bible/refs";
import { classifyCitations, extractCitations } from "./citations";
import type { AgentEvent, VerseRecord } from "./events";
import type { ChatMessage, ToolCall } from "./openai-types";
import { streamChatCompletion } from "./openrouter";
import {
  OpenRouterError,
  openRouterConfig,
  shouldUseLiveAgent,
} from "./openrouter-config";
import { personalizationNote, SYSTEM_PROMPT } from "./system-prompt";
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

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TurnInput {
  chatId: string;
  userId: string | null;
  userMessage: string;
  history?: HistoryTurn[];
  matchedCardLines?: string[];
}

export function buildMessages(input: {
  history: HistoryTurn[];
  userMessage: string;
  matchedCardLines?: string[];
}): ChatMessage[] {
  const recent = input.history.slice(-8).map((m) => ({
    role: m.role,
    content:
      m.content.length > 1200 ? `${m.content.slice(0, 1200)}…` : m.content,
  }));
  const priorQuestions = recent
    .filter((m) => m.role === "user")
    .map((m) => m.content);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...recent,
    {
      role: "user",
      content: `${input.userMessage}\n\n${personalizationNote({
        priorUserQuestions: priorQuestions,
        matchedCardSummaries: input.matchedCardLines ?? [],
      })}`,
    },
  ];
  return messages;
}

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

  const messages = buildMessages({
    history: input.history ?? [],
    userMessage: input.userMessage,
    matchedCardLines: input.matchedCardLines,
  });
  const tools = toolDefinitions();
  const versesSeen = new Map<string, VerseRecord>();
  const pending: AgentEvent[] = [];
  const emit = (event: AgentEvent) => {
    pending.push(event);
  };
  const ctx: ToolContext = {
    userId: input.userId,
    translation: "BSB",
    emit,
    versesSeen,
  };

  let steps = 0;
  let toolRoundUsed = false;
  try {
    while (steps < config.maxSteps) {
      steps += 1;
      let assistantText = "";
      let toolCalls: ToolCall[] | null = null;
      let finishReason: string | null = null;

      // One tool round, then a written answer. Extra rounds burn the free quota.
      const allowTools = !toolRoundUsed;
      for await (const chunk of streamChatCompletion({
        messages,
        tools: allowTools ? tools : undefined,
        config,
      })) {
        if (chunk.type === "text" && chunk.text) {
          assistantText += chunk.text;
          // Show the answer as it arrives. Do not wait for a second model call.
          yield { type: "text_delta", text: chunk.text };
        } else if (chunk.type === "tool_calls_done" && chunk.toolCalls) {
          toolCalls = chunk.toolCalls;
          finishReason = chunk.finishReason ?? "tool_calls";
        } else if (chunk.type === "done") {
          finishReason = chunk.finishReason ?? finishReason;
        }
        while (pending.length) {
          const event = pending.shift();
          if (event) yield event;
        }
      }
      while (pending.length) {
        const event = pending.shift();
        if (event) yield event;
      }

      if (toolCalls?.length && !assistantText) {
        toolRoundUsed = true;
        // Don't show "let me look that up" text from the same turn as a tool call.
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: toolCalls,
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

          if (!tool) {
            const summary = `Unknown tool: ${name}`;
            yield {
              type: "tool_result",
              id: call.id,
              name,
              ok: false,
              summary,
            };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: summary,
            });
            continue;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(call.function.arguments || "{}");
          } catch {
            const summary = "Invalid tool arguments JSON";
            yield {
              type: "tool_result",
              id: call.id,
              name,
              ok: false,
              summary,
            };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: summary,
            });
            continue;
          }

          const validated = tool.inputSchema.safeParse(parsed);
          if (!validated.success) {
            const summary = `Invalid input: ${validated.error.message}`;
            yield {
              type: "tool_result",
              id: call.id,
              name,
              ok: false,
              summary,
            };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: summary,
            });
            continue;
          }

          try {
            const result = await tool.run(validated.data, ctx);
            while (pending.length) {
              const event = pending.shift();
              if (event) yield event;
            }
            yield {
              type: "tool_result",
              id: call.id,
              name,
              ok: true,
              summary: summarizeToolResult(name, result),
            };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result,
            });
          } catch (err) {
            while (pending.length) {
              const event = pending.shift();
              if (event) yield event;
            }
            const summary = err instanceof Error ? err.message : "Tool failed";
            yield {
              type: "tool_result",
              id: call.id,
              name,
              ok: false,
              summary,
            };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Error: ${summary}`,
            });
          }
        }
        continue;
      }

      // Attach real verse text for the chips. Do not spend another model call rewriting.
      const citations = extractCitations(assistantText);
      const { unverified } = classifyCitations(
        citations,
        new Set(versesSeen.keys()),
      );
      if (unverified.length) {
        await fetchCitedVerses(
          unverified.map((c) => c.verseId).slice(0, 3),
          ctx,
        );
        while (pending.length) {
          const event = pending.shift();
          if (event) yield event;
        }
      }

      yield {
        type: "done",
        stopReason: finishReason || "end_turn",
        messageId: crypto.randomUUID(),
      };
      return;
    }

    yield {
      type: "error",
      message:
        "Shalom Guide took too many tool steps. Please try a simpler question.",
    };
  } catch (err) {
    const message =
      err instanceof OpenRouterError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Something went wrong.";
    yield { type: "error", message };
  }
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return raw;
  }
}

function summarizeToolResult(name: string, result: string): string {
  const lines = result.split("\n").filter(Boolean).length;
  if (name === "lookup_verses" || name === "search_bible")
    return `${lines} verse${lines === 1 ? "" : "s"}`;
  if (name === "search_flashcards") {
    if (result.startsWith("No strong")) return "no match";
    return `${lines} card${lines === 1 ? "" : "s"}`;
  }
  if (name === "propose_flashcard") return "draft ready";
  return result.slice(0, 80);
}

async function fetchCitedVerses(
  verseIds: string[],
  ctx: ToolContext,
): Promise<string> {
  const ranges = [];
  for (const id of verseIds) {
    const parsed = parseVerseId(id);
    if (!parsed) continue;
    ranges.push({
      book: parsed.book,
      chapter: parsed.chapter,
      verseStart: parsed.verse,
      verseEnd: parsed.verse,
    });
  }
  if (!ranges.length) return "";
  try {
    const verses = await lookupRanges(ranges);
    for (const v of verses) {
      ctx.versesSeen.set(v.id, {
        id: v.id,
        label: v.label,
        text: v.text,
        translation: v.translation,
      });
    }
    if (verses.length) {
      ctx.emit({
        type: "verses",
        verses: verses.map((v) => ({
          id: v.id,
          label: v.label,
          text: v.text,
          translation: v.translation,
        })),
      });
    }
    return verses
      .map((v) => `${verseIdToLabel(v.id)} (${v.id}): ${v.text}`)
      .join("\n");
  } catch (err) {
    return err instanceof Error ? err.message : "Fetch failed";
  }
}
