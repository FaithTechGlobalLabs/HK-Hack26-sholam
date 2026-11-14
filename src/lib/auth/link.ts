import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "./next-path";

/**
 * The emailed sign-in link: `/auth/confirm?token_hash=…&type=email`. It works
 * in any browser (no PKCE verifier needed). The confirm page asks for one
 * click before the token is spent, so mail scanners that open links cannot
 * use it up.
 */

/** Link types the sign-in emails use. `email` covers new and returning users. */
const LINK_TYPES = [
  "email",
  "magiclink",
  "signup",
] as const satisfies readonly EmailOtpType[];
export type LinkType = (typeof LINK_TYPES)[number];

export interface SignInLink {
  tokenHash: string;
  type: LinkType;
  next: string;
}

/** Reads and checks the link's parameters; null if any is missing or odd. */
export function parseSignInLink(params: {
  token_hash?: unknown;
  type?: unknown;
  next?: unknown;
}): SignInLink | null {
  const tokenHash = first(params.token_hash);
  const type = first(params.type) ?? "email";
  if (!tokenHash || !/^[A-Za-z0-9_-]{8,256}$/.test(tokenHash)) return null;
  if (!(LINK_TYPES as readonly string[]).includes(type)) return null;
  return {
    tokenHash,
    type: type as LinkType,
    next: safeNextPath(first(params.next)),
  };
}

function first(value: unknown): string | undefined {
  if (Array.isArray(value)) return first(value[0]);
  return typeof value === "string" && value ? value : undefined;
}
