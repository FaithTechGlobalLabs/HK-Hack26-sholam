/**
 * Small guards for route handlers that change state.
 *
 * Browsers send `Origin` on every POST/PATCH (and `Sec-Fetch-Site` on
 * modern ones), so requiring a same-origin request blocks cross-site form
 * posts: forced sign-in to someone else's account, forced sign-out, or a
 * text/plain body that happens to parse as JSON.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host =
        request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

/**
 * May this state-changing request proceed? A verified native Bearer token
 * is not ambient (a cross-site page cannot attach it), so it needs no
 * Origin. Everything else, including cookie sessions, must be same-origin.
 * Pass `bearerVerified` only from `isBearerIdentity(...)`.
 */
export function isTrustedMutation(
  request: Request,
  bearerVerified: boolean,
): boolean {
  return bearerVerified || isSameOrigin(request);
}

export function isJson(request: Request): boolean {
  return (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .startsWith("application/json");
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE });
}
