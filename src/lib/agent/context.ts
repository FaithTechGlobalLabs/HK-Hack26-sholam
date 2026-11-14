/**
 * Context-size control: which history, card lines and tool results reach the
 * model, and how a request is cut to the prompt budget. Limits live in
 * `limits.ts`. The system prompt is never edited here (prompt caching).
 * No server-only imports: the browser uses `trimHistory` too.
 */

import { LIMITS } from "./limits";
import type { ChatMessage } from "./openai-types";
import { personalizationNote, SYSTEM_PROMPT } from "./system-prompt";

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * The newest turns that fit both a turn count and a character budget, each
 * clipped to `turnChars`. Starts on a user turn so the model never opens on
 * an orphaned reply.
 */
export function trimHistory(
  history: readonly HistoryTurn[],
  limits: { turns: number; turnChars: number; totalChars: number },
): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0 && out.length < limits.turns; i--) {
    const turn = history[i];
    const content = clip(turn.content, limits.turnChars);
    if (!content.trim()) continue;
    if (total + content.length > limits.totalChars) break;
    total += content.length;
    out.unshift({ role: turn.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** A request in three parts, so the budget can cut history before anything else. */
export interface PromptParts {
  /** Earlier user/assistant turns. */
  history: ChatMessage[];
  /** This turn's question plus the session note. */
  current: ChatMessage;
  /** This turn's tool calls, tool results and drafts, appended by the loop. */
  tail: ChatMessage[];
}

export function buildPromptParts(input: {
  history: readonly HistoryTurn[];
  userMessage: string;
  matchedCardLines?: readonly string[];
}): PromptParts {
  const recent = trimHistory(input.history, {
    turns: LIMITS.model.historyTurns,
    turnChars: LIMITS.model.historyTurnChars,
    totalChars: LIMITS.model.historyChars,
  });
  const priorQuestions = recent
    .filter((m) => m.role === "user")
    .slice(-LIMITS.model.priorQuestions)
    .map((m) => clip(m.content, LIMITS.model.priorQuestionChars));
  const cards = (input.matchedCardLines ?? [])
    .slice(0, LIMITS.model.matchedCards)
    .map((line) => clip(line, LIMITS.model.matchedCardChars));

  return {
    history: recent.map((m) => ({ role: m.role, content: m.content })),
    current: {
      role: "user",
      content: `${clip(input.userMessage, LIMITS.request.maxMessageChars)}\n\n${personalizationNote(
        {
          priorUserQuestions: priorQuestions,
          matchedCardSummaries: cards,
        },
      )}`,
    },
    tail: [],
  };
}

export function messageChars(message: ChatMessage): number {
  return (
    (message.content?.length ?? 0) +
    (message.tool_calls ? JSON.stringify(message.tool_calls).length : 0)
  );
}

export function promptChars(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + messageChars(m), 0);
}

const TOOL_RESULT_FLOOR = 400;

/**
 * `[system, ...history, current, ...tail]` within `maxChars`: drop the
 * oldest history turns first, then clip the longest tool results (never
 * below a small floor). The system prompt and the current question are
 * never cut.
 */
export function assemblePrompt(
  parts: PromptParts,
  maxChars: number = LIMITS.model.promptChars,
): ChatMessage[] {
  const system: ChatMessage = { role: "system", content: SYSTEM_PROMPT };
  const history = [...parts.history];
  const tail = parts.tail.map((m) => ({ ...m }));
  const size = () => promptChars([system, ...history, parts.current, ...tail]);

  while (history.length && size() > maxChars) {
    history.shift();
    while (history.length && history[0].role !== "user") history.shift();
  }

  let over = size() - maxChars;
  while (over > 0) {
    const longest = tail
      .filter(
        (m) =>
          m.role === "tool" && (m.content?.length ?? 0) > TOOL_RESULT_FLOOR,
      )
      .sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))[0];
    if (!longest?.content) break;
    const target = Math.max(TOOL_RESULT_FLOOR, longest.content.length - over);
    longest.content = clip(longest.content, target);
    over = size() - maxChars;
  }

  return [system, ...history, parts.current, ...tail];
}

/** Tool output as the model sees it: never more than the tool result budget. */
export function clipToolResult(text: string): string {
  if (text.length <= LIMITS.tools.resultChars) return text;
  return `${text.slice(0, LIMITS.tools.resultChars - 40)}\n[result cut to fit; ask for less]`;
}
