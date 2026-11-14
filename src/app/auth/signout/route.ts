import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out on this device (clears the session cookies) and returns to a
 * new chat. POST only, from this site only, so a link or another site
 * cannot sign someone out.
 */
export async function POST(request: Request) {
  const home = NextResponse.redirect(new URL("/", request.url), 303);
  if (!isSameOrigin(request)) return home;
  const supabase = await createClient();
  await supabase?.auth.signOut({ scope: "local" });
  return home;
}
