import "server-only";

import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { profiles } from "@/db/schema";
import type { RequestIdentity } from "@/lib/supabase/request-auth";
import { createClient } from "@/lib/supabase/server";
import type { Account } from "./types";

export interface SignedInAccount extends Account {
  id: string;
}

/**
 * The signed-in person, from the verified session (`getClaims`) plus their
 * profile row. Null when signed out or when Supabase is not configured.
 * Reads cookies, so callers must sit under <Suspense> or in a route handler.
 */
export async function getAccount(): Promise<SignedInAccount | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const email = typeof claims.email === "string" ? claims.email : null;
  return {
    id: claims.sub,
    email,
    displayName: await displayNameFor(claims.sub),
  };
}

/**
 * The account behind a verified request identity (native Bearer or web
 * cookie, see `resolveRequestIdentity`). Null for guests and invalid ones.
 */
export async function accountForIdentity(
  identity: RequestIdentity,
): Promise<SignedInAccount | null> {
  if (identity.kind !== "authenticated") return null;
  return {
    id: identity.userId,
    email: identity.email,
    displayName: await displayNameFor(identity.userId),
  };
}

export async function displayNameFor(userId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const [row] = await getDb()
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row?.displayName ?? null;
  } catch {
    return null;
  }
}

/** Sets the signed-in person's display name (creates the profile row if the trigger missed it). */
export async function saveDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  await getDb()
    .insert(profiles)
    .values({ id: userId, displayName })
    .onConflictDoUpdate({ target: profiles.id, set: { displayName } });
}

/**
 * Where a fresh sign-in goes next: new accounts (no name yet) stop at the
 * name step on /login; everyone else continues to `next`.
 */
export async function afterSignInPath(
  userId: string,
  next: string,
): Promise<string> {
  if (!isDatabaseConfigured()) return next;
  if (await displayNameFor(userId)) return next;
  return `/login?step=name&next=${encodeURIComponent(next)}`;
}
