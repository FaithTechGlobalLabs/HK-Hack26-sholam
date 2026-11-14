import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/** Null until both public Supabase values are set. The secret key stays on the server. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = supabaseConfig();
  client = env
    ? createClient(env.url, env.key, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;
  return client;
}
