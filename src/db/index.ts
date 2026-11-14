import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** A Drizzle client for one connection string (scripts pass DIRECT_URL). */
export function createDb(url: string, options: { max?: number } = {}) {
  // prepare: false is required by Supabase's transaction-mode pooler and
  // harmless on the session pooler.
  const client = postgres(url, { prepare: false, max: options.max ?? 5 });
  return Object.assign(drizzle(client, { schema, casing: "snake_case" }), {
    $close: () => client.end(),
  });
}

let db: Db | undefined;

/**
 * Server-only Drizzle client on the Supabase transaction pooler. It connects
 * as the database owner and bypasses RLS, so every query must scope by user
 * itself. RLS still protects anything reached through supabase-js from the
 * browser.
 */
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  db ??= createDb(url);
  return db;
}
