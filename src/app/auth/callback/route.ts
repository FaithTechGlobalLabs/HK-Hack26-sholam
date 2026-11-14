import { NextResponse } from "next/server";
import { afterSignInPath } from "@/lib/account/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { classifyAuthError } from "@/lib/auth/problems";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth (and older PKCE email-link) return URL: swaps the one-time code for
 * a session. Email sign-in now uses /auth/confirm; this stays for Google
 * sign-in later. Supabase reports failures as `error` / `error_code` /
 * `error_description` parameters, which go back to /login explained.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (path: string) =>
    NextResponse.redirect(new URL(path, url.origin));
  const next = safeNextPath(url.searchParams.get("next"));

  // The sign-in email's token_hash link returns here (it is the
  // emailRedirectTo); src/proxy.ts normally forwards it first.
  if (url.searchParams.has("token_hash"))
    return back(`/auth/confirm${url.search}`);

  const errorCode =
    url.searchParams.get("error_code") ?? url.searchParams.get("error");
  if (errorCode) {
    const { problem } = classifyAuthError(
      {
        code: errorCode,
        message: url.searchParams.get("error_description"),
      },
      "link",
    );
    return back(`/login?error=${problem}`);
  }

  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (!code || !supabase) return back("/login?error=link_missing");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    const { problem } = classifyAuthError(error, "link");
    return back(`/login?error=${problem}`);
  }
  return back(await afterSignInPath(data.user.id, next));
}
