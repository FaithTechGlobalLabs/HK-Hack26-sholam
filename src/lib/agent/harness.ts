/**
 * The chat agent: a manual streaming tool-use loop over the Anthropic
 * Messages API. We own the loop (rather than the SDK's beta tool runner)
 * because the browser needs typed custom events (verse chips, flashcard
 * hits, card proposals) interleaved with the text stream.
 *
 * Loop (Phase 2), per user turn:
 *   1. history = stored content blocks for the chat (verbatim, append-only)
 *   2. stream = client.messages.stream(buildRequest(history))
 *      - forward text deltas as { type: "text_delta" }
 *   3. message = await stream.finalMessage(); persist message.content as is
 *   4. stop_reason:
 *      - "end_turn"   -> check citations, emit done
 *      - "tool_use"   -> validate each input with the tool's zod schema, run
 *                        tools (in parallel), emit tool_start/tool_result,
 *                        append ALL tool_result blocks in ONE user message
 *                        (is_error: true on failure), loop to 2
 *      - "pause_turn" -> append assistant content and loop to 2
 *      - "max_tokens" | "refusal" -> emit done with that reason; never run
 *                        tools from a truncated or refused turn
 *   5. cap at MAX_STEPS tool rounds; emit error if exceeded
 */

import type Anthropic from "@anthropic-ai/sdk";
import { defaultModel, modelRoute } from "./client";
import type { AgentEvent } from "./events";
import { SYSTEM_PROMPT } from "./system-prompt";
import { toolDefinitions } from "./tools";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentConfig {
  model: string;
  /** null = send no effort (SHOLAM_EFFORT=off), for routes that reject it */
  effort: Effort | null;
  maxTokens: number;
  maxSteps: number;
  /** "default" turns on server-side refusal fallbacks (direct Anthropic API only). */
  fallbacks: "default" | "off";
}

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function agentConfig(
  env: Record<string, string | undefined> = process.env,
): AgentConfig {
  const effort = env.SHOLAM_EFFORT as Effort | "off" | undefined;
  return {
    model: defaultModel(env),
    effort:
      effort === "off"
        ? null
        : effort && EFFORTS.includes(effort)
          ? effort
          : "medium",
    maxTokens: 16000,
    maxSteps: 8,
    // The fallbacks beta is an Anthropic API feature; gateways may not pass it on.
    fallbacks:
      env.SHOLAM_FALLBACKS === "default" && modelRoute(env) === "anthropic"
        ? "default"
        : "off",
  };
}

/**
 * Request body for one loop step. Tools and system come first and never
 * change between requests, so the cache breakpoint on the system block
 * covers both. Thinking is left at the model default (adaptive on Opus 5.5).
 * Phase 2: when config.fallbacks is "default", send this through
 * client.beta.messages.stream with betas ["server-side-fallback-2026-07-01"]
 * and fallbacks: "default".
 */
export function buildRequest(
  history: Anthropic.MessageParam[],
  config: AgentConfig = agentConfig(),
): Anthropic.MessageStreamParams {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    ...(config.effort ? { output_config: { effort: config.effort } } : {}),
    tools: toolDefinitions(),
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: history,
  };
}

export interface TurnInput {
  chatId: string;
  userId: string | null;
  userMessage: string;
}

export async function* runAgentTurn(
  _input: TurnInput,
): AsyncGenerator<AgentEvent> {
  // Yield at least once so callers can treat this as an event source today.
  yield {
    type: "error",
    message:
      "The agent loop is not implemented yet (Phase 2, see docs/PLAN.md).",
  };
}
