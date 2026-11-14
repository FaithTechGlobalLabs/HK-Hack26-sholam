/**
 * One small request through the configured model route (OpenRouter or
 * Anthropic) to prove the credentials, the model id and the request shape
 * sholam sends: system prompt with cache_control, the tool definitions and,
 * unless SHOLAM_EFFORT=off, output_config.effort. Costs a fraction of a cent.
 *
 * Run: npm run model:smoke   (reads .env.local)
 */

import "./_env";
import { createModelClient, modelRoute } from "../src/lib/agent/client";
import { agentConfig, buildRequest } from "../src/lib/agent/harness";

async function main() {
  const route = modelRoute();
  if (route === "none")
    throw new Error(
      "No model credentials: set OPENROUTER_API_KEY in .env.local",
    );
  const config = { ...agentConfig(), maxTokens: 64 };
  const client = createModelClient();
  const started = Date.now();
  const message = await client.messages
    .stream(
      buildRequest(
        [{ role: "user", content: "Reply with the single word: peace" }],
        config,
      ),
    )
    .finalMessage();
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  console.log(`route: ${route}`);
  console.log(`model: ${config.model} (served as ${message.model})`);
  console.log(`effort sent: ${config.effort ?? "none"}`);
  console.log(
    `stop: ${message.stop_reason}; reply: ${JSON.stringify(text.slice(0, 80))}`,
  );
  console.log(
    `usage: in ${message.usage.input_tokens}, out ${message.usage.output_tokens}, cache write ${message.usage.cache_creation_input_tokens ?? 0}, cache read ${message.usage.cache_read_input_tokens ?? 0}; ${Date.now() - started} ms`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
