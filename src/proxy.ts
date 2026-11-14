import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session cookie on every page request. Inert until
 * Supabase env vars are set. Pages that need the account check it
 * themselves (`/c/[chatId]` is owner-only); there is no blanket protection.
 *
 * A sign-in link that lands anywhere but /auth/confirm (Supabase falls back
 * to the site URL when the requested redirect is not on its allow list) is
 * forwarded there with its parameters.
 */
const API_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, x-shalom-client, x-shalom-device, x-shalom-customer",
  "Access-Control-Max-Age": "86400",
};

/** The iOS app calls these routes from Expo, which is a different origin. */
function apiCors(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: API_CORS });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(API_CORS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/api/")) return apiCors(request);
  if (searchParams.has("token_hash") && pathname !== "/auth/confirm") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    return NextResponse.redirect(url);
  }

  const env = supabaseEnv();
  if (!env) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {}))
          response.headers.set(key, value);
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
