import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./config";

/**
 * Server client for Server Components, Route Handlers and Server Actions.
 * Returns null until Supabase env vars are set. Server Components cannot
 * write cookies; `src/proxy.ts` refreshes the session before they run.
 */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component; the proxy handles the refresh.
        }
      },
    },
  });
}

/** The signed-in user's id, or null (signed out or Supabase not configured). */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}
