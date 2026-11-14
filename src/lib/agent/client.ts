/**
 * Model client. sholam always talks the Anthropic Messages API through the
 * official SDK; only the route changes:
 *
 * - openrouter: OPENROUTER_API_KEY set. OpenRouter's Anthropic-compatible
 *   endpoint ("Anthropic Skin") at https://openrouter.ai/api, bearer auth,
 *   model ids like `anthropic/claude-opus-5.5`.
 *   https://openrouter.ai/docs/guides/coding-agents/claude-code-integration
 * - anthropic: ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set (optionally
 *   ANTHROPIC_BASE_URL for a local gateway). Model ids like `claude-opus-5-5`.
 * - none: no credentials; /api/chat keeps streaming the demo.
 */

import Anthropic from "@anthropic-ai/sdk";

export type ModelRoute = "openrouter" | "anthropic" | "none";

type Env = Record<string, string | undefined>;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

const DEFAULT_MODEL: Record<Exclude<ModelRoute, "none">, string> = {
  openrouter: "anthropic/claude-opus-5.5",
  anthropic: "claude-opus-5-5",
};

export function modelRoute(env: Env = process.env): ModelRoute {
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return "none";
}

/** SHOLAM_MODEL if set, else the route's default (OpenRouter and Anthropic name models differently). */
export function defaultModel(env: Env = process.env): string {
  if (env.SHOLAM_MODEL) return env.SHOLAM_MODEL;
  const route = modelRoute(env);
  return DEFAULT_MODEL[route === "none" ? "anthropic" : route];
}

export function createModelClient(env: Env = process.env): Anthropic {
  const route = modelRoute(env);
  if (route === "openrouter") {
    return new Anthropic({
      baseURL: env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL,
      // OpenRouter authenticates with a bearer token; never send x-api-key.
      apiKey: null,
      authToken: env.OPENROUTER_API_KEY,
      defaultHeaders: {
        // OpenRouter app attribution (shows sholam in the OpenRouter dashboard).
        "HTTP-Referer": env.SHOLAM_SITE_URL || "https://sholam.vercel.app",
        "X-Title": "sholam",
      },
    });
  }
  if (route === "anthropic") {
    // The SDK reads ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL itself.
    return new Anthropic();
  }
  throw new Error(
    "No model credentials. Set OPENROUTER_API_KEY (see .env.example).",
  );
}
