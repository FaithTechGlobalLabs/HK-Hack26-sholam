import { connection } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured } from "@/db";
import { getAccount, saveDisplayName } from "@/lib/account/server";
import { type AccountResponse, displayNameSchema } from "@/lib/account/types";
import { isJson, isSameOrigin, jsonError, NO_STORE } from "@/lib/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Who is signed in (or nobody). The browser's account hook reads this. */
export async function GET() {
  await connection();
  const account = await getAccount();
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
  if (!isSameOrigin(request) || !isJson(request))
    return jsonError(403, "Forbidden");
  const account = await getAccount();
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
