/**
 * Where to send someone after they sign in. Only paths on this site are
 * allowed, so a crafted `?next=https://evil.example` (or `//evil.example`)
 * cannot turn sign-in into an open redirect. Auth pages fall back to "/"
 * so a finished sign-in never lands back in the sign-in flow.
 */
export function safeNextPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    // Control characters and backslashes can smuggle a host past the checks.
    if (code < 0x20 || code === 0x7f || next[i] === "\\") return fallback;
  }
  let url: URL;
  try {
    url = new URL(next, "https://same.origin");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://same.origin") return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/auth/"))
    return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
