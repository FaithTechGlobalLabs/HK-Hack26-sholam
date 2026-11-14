import "server-only";

import type { ChatMessage, OpenAiTool, ToolCall } from "./openai-types";
import {
  mapProviderError,
  type OpenRouterConfig,
  OpenRouterError,
  openRouterConfig,
} from "./openrouter-config";
import {
  FREE_MIN_GAP_MS,
  FREE_MINUTE_BUDGET,
  isFreeModel,
  planRateLimit,
} from "./rate-limit";

export type { ChatMessage, OpenAiTool, ToolCall };
export {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  mapProviderError,
  type OpenRouterConfig,
  OpenRouterError,
  openRouterConfig,
  shouldUseLiveAgent,
} from "./openrouter-config";

/**
 * Thin OpenRouter client (OpenAI-compatible chat completions).
 * The API key stays on the server; never log or return it.
 */

const REQUEST_TIMEOUT_MS = 45_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serialises free-model calls so a tool loop cannot burst past ~20/minute. */
const recentFreeCalls: number[] = [];
let freeGate: Promise<void> = Promise.resolve();

function paceFreeModel(): Promise<void> {
  const run = freeGate.then(async () => {
    const now = Date.now();
    while (recentFreeCalls.length && now - recentFreeCalls[0] > 60_000) {
      recentFreeCalls.shift();
    }
    const last = recentFreeCalls.at(-1) ?? 0;
    const gap = last + FREE_MIN_GAP_MS - Date.now();
    const windowWait =
      recentFreeCalls.length >= FREE_MINUTE_BUDGET
        ? recentFreeCalls[0] + 60_000 - Date.now()
        : 0;
    const wait = Math.min(Math.max(gap, windowWait, 0), 12_000);
    if (wait > 0) await sleep(wait);
    recentFreeCalls.push(Date.now());
  });
  freeGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export interface StreamChunk {
  type: "text" | "tool_calls_done" | "done";
  text?: string;
  toolCalls?: ToolCall[];
  finishReason?: string | null;
}

/**
 * Streams one chat.completions call. Yields text deltas, then a final
 * tool_calls_done (if any) and done. Never includes the API key in errors.
 */
export async function* streamChatCompletion(options: {
  messages: ChatMessage[];
  tools?: OpenAiTool[];
  config?: OpenRouterConfig;
  signal?: AbortSignal;
}): AsyncGenerator<StreamChunk> {
  const config = options.config ?? openRouterConfig();
  if (!config.apiKey) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is missing. Add it to .env.local and restart the dev server.",
    );
  }

  let lastError: OpenRouterError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (isFreeModel(config.model)) await paceFreeModel();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://shalom.app",
          "X-Title": "Shalom",
        },
        body: JSON.stringify({
          model: config.model,
          messages: options.messages,
          tools: options.tools?.length ? options.tools : undefined,
          tool_choice: options.tools?.length ? "auto" : undefined,
          stream: true,
          temperature: 0.4,
          max_tokens: config.maxTokens,
        }),
        signal: controller.signal,
      });

      if (res.status === 429 || res.status === 502 || res.status === 503) {
        await res.text().catch(() => "");
        const plan = planRateLimit(res.headers, attempt);
        lastError = new OpenRouterError(
          plan.message || mapProviderError(res.status).message,
          res.status,
        );
        if (plan.action === "retry") {
          await sleep(plan.waitMs);
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        await res.text().catch(() => "");
        throw mapProviderError(res.status);
      }
      if (!res.body) throw mapProviderError(undefined);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const toolAcc = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();
      let finishReason: string | null = null;
      let sawContent = false;
      let retryMidStream = false;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let parsed: {
            error?: { code?: number; message?: string };
            choices?: {
              delta?: {
                content?: string | null;
                tool_calls?: {
                  index?: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }[];
              };
              finish_reason?: string | null;
            }[];
          };
          try {
            parsed = JSON.parse(data);
          } catch {
            continue;
          }
          if (parsed.error?.code === 429 && !sawContent) {
            retryMidStream = true;
            break;
          }
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason === "error" && !sawContent) {
            retryMidStream = true;
            break;
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta;
          if (delta?.content) {
            sawContent = true;
            yield { type: "text", text: delta.content };
          }
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            const cur = toolAcc.get(idx) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.arguments += tc.function.arguments;
            toolAcc.set(idx, cur);
          }
        }
        if (retryMidStream) break;
      }

      if (retryMidStream) {
        await reader.cancel().catch(() => undefined);
        const plan = planRateLimit({ get: () => null }, attempt);
        lastError = new OpenRouterError(plan.message, 429);
        if (plan.action === "retry") {
          await sleep(plan.waitMs);
          continue;
        }
        throw lastError;
      }

      const toolCalls: ToolCall[] = [...toolAcc.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, t]) => ({
          id: t.id || crypto.randomUUID(),
          type: "function" as const,
          function: { name: t.name, arguments: t.arguments || "{}" },
        }))
        .filter((t) => t.function.name);

      if (toolCalls.length) {
        yield { type: "tool_calls_done", toolCalls, finishReason };
      } else if (!sawContent && !finishReason) {
        throw new OpenRouterError(
          "The model returned an empty reply. Please try again.",
        );
      }
      yield { type: "done", finishReason };
      return;
    } catch (err) {
      if (err instanceof OpenRouterError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new OpenRouterError(
          "The model took too long to reply. Please try again.",
          408,
        );
      }
      throw mapProviderError(undefined);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  throw (
    lastError ??
    new OpenRouterError(
      "Shalom Guide is briefly busy. Wait a few seconds and send that again.",
      429,
    )
  );
}
