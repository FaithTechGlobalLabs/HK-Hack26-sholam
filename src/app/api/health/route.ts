import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { defaultModel, modelRoute } from "@/lib/agent/client";
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
  const route = modelRoute();
  return Response.json({
    model: { route, id: route === "none" ? null : defaultModel() },
    agent: process.env.SHOLAM_AGENT === "live" ? "live" : "demo",
    database,
    auth: isSupabaseConfigured() ? "configured" : "unconfigured",
  });
}
