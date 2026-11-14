// Side-effect import for scripts: load .env.local the way `next dev` does.
// Import it first so later modules see the variables.
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Session-pooler URL for scripts and migrations; falls back to DATABASE_URL. */
export function scriptDatabaseUrl(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url)
    throw new Error("Set DIRECT_URL or DATABASE_URL (see .env.example)");
  return url;
}
