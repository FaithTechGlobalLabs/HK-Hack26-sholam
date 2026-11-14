"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./config";

/** Browser client. Returns null until Supabase env vars are set. */
export function createClient() {
  const env = supabaseEnv();
  return env ? createBrowserClient(env.url, env.key) : null;
}
