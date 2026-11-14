import { NextResponse } from "next/server";
import { afterSignInPath } from "@/lib/account/server";
import { parseSignInLink } from "@/lib/auth/link";
import { classifyAuthError } from "@/lib/auth/problems";
import { isSameOrigin } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

/**
 * The confirm page's "Sign in" button posts here. Spends the emailed
 * token_hash (`verifyOtp`), which sets the session cookies, then sends the
 * person on: new accounts to the name step, everyone else to `next`.
 * Failures go back to /login with a reason it can explain.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const back = (path: string) =>
    NextResponse.redirect(new URL(path, origin), 303);

  if (!isSameOrigin(request)) return back("/login?error=unknown");

  const form = await request.formData().catch(() => null);
  const link = parseSignInLink({
    token_hash: form?.get("token_hash"),
    type: form?.get("type"),
    next: form?.get("next"),
  });
  if (!link) return back("/login?error=link_missing");

  const supabase = await createClient();
  if (!supabase) return back("/login");

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: link.tokenHash,
    type: link.type,
  });
  if (error || !data.user) {
    const { problem } = classifyAuthError(error, "link");
    return back(`/login?error=${problem}`);
  }
  return back(await afterSignInPath(data.user.id, link.next));
}
