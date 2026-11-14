/**
 * OpenRouter env helpers — safe to import from tests (no server-only).
 */

import { LIMITS } from "./limits";

/** Free endpoint only. The paid id `nvidia/nemotron-3-ultra-550b-a55b` is never used. */
export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

/**
 * Shalom runs on free OpenRouter models only (decision 2026-11-14,
 * docs/PLAN.md). A `SHOLAM_MODEL` that is not a `:free` id is ignored, so a
 * typo or a paid id in an env file can never spend credits.
 */
export function freeModelOrDefault(requested: string | undefined): string {
  const id = requested?.trim();
  return id?.endsWith(":free") ? id : DEFAULT_MODEL;
}
export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  maxTokens: number;
  maxSteps: number;
}

export function openRouterConfig(
  env: Record<string, string | undefined> = process.env,
): OpenRouterConfig {
  return {
    apiKey: env.OPENROUTER_API_KEY?.trim() || undefined,
    baseUrl: (env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: freeModelOrDefault(env.SHOLAM_MODEL),
    maxTokens: LIMITS.model.maxTokens,
    maxSteps: LIMITS.turn.maxModelCalls,
  };
}

/** Live when a key is present, unless SHOLAM_AGENT=demo. Force live with SHOLAM_AGENT=live. */
export function shouldUseLiveAgent(
  env: Record<string, string | undefined> = process.env,
): { live: boolean; reason?: string } {
  const mode = env.SHOLAM_AGENT?.trim().toLowerCase();
  const key = env.OPENROUTER_API_KEY?.trim();
  if (mode === "demo") return { live: false };
  if (mode === "live") {
    if (!key)
      return {
        live: true,
        reason:
          "OPENROUTER_API_KEY is missing. Add it to .env.local and restart the dev server.",
      };
    return { live: true };
  }
  if (key) return { live: true };
  return { live: false };
}

/** The client went away (Stop, closed tab). Not an error to report. */
export class TurnAborted extends Error {
  constructor() {
    super("The request was stopped.");
    this.name = "TurnAborted";
  }
}

export function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return (
    err instanceof TurnAborted ||
    (signal?.aborted === true &&
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export function mapProviderError(status: number | undefined, _body?: string) {
  if (status === 401 || status === 403)
    return new OpenRouterError(
      "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.local (or your host's server env) and restart.",
      status,
    );
  if (status === 429)
    return new OpenRouterError(
      "Shalom Guide is rate-limited right now. Wait a moment and try again.",
      status,
    );
  if (status === 408)
    return new OpenRouterError(
      "The model took too long to reply. Please try again.",
      status,
    );
  return new OpenRouterError(
    "Shalom Guide could not reach the model. Please try again in a moment.",
    status,
  );
}
