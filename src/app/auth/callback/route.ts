import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Magic-link / OAuth return URL: swaps the one-time code for a session. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
