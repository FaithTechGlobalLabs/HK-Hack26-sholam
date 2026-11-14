import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Server-only Drizzle client on the Supabase pooler. It connects as the
 * database owner and bypasses RLS, so every query must scope by user itself.
 * RLS still protects anything reached through supabase-js from the browser.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false is required by Supabase's transaction-mode pooler.
  db ??= drizzle(postgres(url, { prepare: false }), {
    schema,
    casing: "snake_case",
  });
  return db;
}
