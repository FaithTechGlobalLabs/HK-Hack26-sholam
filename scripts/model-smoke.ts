/**
 * One small OpenRouter chat completion to prove the key, the model id and
 * the request shape sholam sends. Costs a fraction of a cent on a paid model;
 * a `:free` model spends one request of the daily allowance.
 *
 * Run: npm run model:smoke   (reads .env.local)
 */

import "./_env";
import { openRouterConfig } from "../src/lib/agent/openrouter-config";

async function main() {
  const config = openRouterConfig();
  if (!config.apiKey) {
    throw new Error(
      "No model credentials: set OPENROUTER_API_KEY in .env.local",
    );
  }
  const started = Date.now();
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 32,
      temperature: 0.4,
      messages: [
        { role: "user", content: "Reply with the single word: peace" },
      ],
    }),
  });
  const body = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `OpenRouter ${res.status}: ${body.error?.message ?? "request failed"}`,
    );
  }
  const text = body.choices?.[0]?.message?.content ?? "";
  console.log("route: openrouter");
  console.log(`model: ${config.model} (served as ${body.model ?? "unknown"})`);
  console.log(`reply: ${JSON.stringify(text.slice(0, 80))}`);
  console.log(
    `usage: in ${body.usage?.prompt_tokens ?? 0}, out ${body.usage?.completion_tokens ?? 0}; ${Date.now() - started} ms`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
