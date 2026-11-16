import { connection } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured } from "@/db";
import { accountForIdentity, saveDisplayName } from "@/lib/account/server";
import { type AccountResponse, displayNameSchema } from "@/lib/account/types";
import {
  isJson,
  isSameOrigin,
  isTrustedMutation,
  jsonError,
  NO_STORE,
} from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  identityRefusal,
  isBearerIdentity,
  resolveRequestIdentity,
} from "@/lib/supabase/request-auth";

/**
 * Who is signed in (or nobody). The browser's account hook reads this with
 * cookies; the native app sends `Authorization: Bearer <access token>`.
 */
export async function GET(request: Request) {
  await connection();
  const identity = await resolveRequestIdentity(request);
  const refused = identityRefusal(identity);
  if (refused) return refused;
  const account = await accountForIdentity(identity);
  const body: AccountResponse = {
    enabled: isSupabaseConfigured(),
    account: account
      ? { email: account.email, displayName: account.displayName }
      : null,
    canSave: isDatabaseConfigured(),
  };
  return Response.json(body, { headers: NO_STORE });
}

const patchSchema = z.strictObject({ displayName: displayNameSchema });

/** Sets the signed-in person's display name (`profiles.display_name`). */
export async function PATCH(request: Request) {
  if (!isJson(request)) return jsonError(403, "Forbidden");
  // Cookie path: refuse cross-site requests before reading the session.
  if (!request.headers.has("authorization") && !isSameOrigin(request))
    return jsonError(403, "Forbidden");
  const identity = await resolveRequestIdentity(request);
  const refused = identityRefusal(identity);
  if (refused) return refused;
  if (!isTrustedMutation(request, isBearerIdentity(identity)))
    return jsonError(403, "Forbidden");
  const account = await accountForIdentity(identity);
  if (!account) return jsonError(401, "Sign in first");
  if (!isDatabaseConfigured())
    return jsonError(503, "Names can't be saved yet");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(400, "Use 1 to 40 characters for your name");

  await saveDisplayName(account.id, parsed.data.displayName);
  const body: AccountResponse = {
    enabled: true,
    account: { email: account.email, displayName: parsed.data.displayName },
    canSave: true,
  };
  return Response.json(body, { headers: NO_STORE });
}
