import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import {
  openRouterConfig,
  shouldUseLiveAgent,
} from "@/lib/agent/openrouter-config";
import { stripeConfigGaps } from "@/lib/billing/plans";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Deployment check without secrets: which model route and model id are
 * configured, whether the agent runs live, and whether Postgres answers.
 * Makes no model call.
 */
export async function GET() {
  await connection(); // always at request time, never prerendered
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  if (isDatabaseConfigured()) {
    try {
      await getDb().execute(sql`select 1`);
      database = "ok";
    } catch {
      database = "error";
    }
  }
  const config = openRouterConfig();
  const mode = shouldUseLiveAgent();
  return Response.json({
    model: {
      route: config.apiKey ? "openrouter" : "none",
      id: config.apiKey ? config.model : null,
    },
    agent: mode.live ? "live" : "demo",
    database,
    auth: isSupabaseConfigured() ? "configured" : "unconfigured",
    billing: {
      ready: stripeConfigGaps().length === 0,
      missing: stripeConfigGaps(),
    },
  });
}
