import { getDb, isDatabaseConfigured } from "@/db";
import { importTabChats, tabChatsSchema } from "@/lib/chat/store";
import {
  isJson,
  isSameOrigin,
  isTrustedMutation,
  jsonError,
  NO_STORE,
} from "@/lib/http";
import {
  identityRefusal,
  isBearerIdentity,
  resolveRequestIdentity,
} from "@/lib/supabase/request-auth";

/**
 * Keeps the chats from a signed-out tab (sessionStorage history) in the
 * signed-in account. Text only: imported answers carry no verse records.
 * Cookie requests must be same-origin; a verified Bearer token needs no Origin.
 */
export async function POST(request: Request) {
  if (!isJson(request)) return jsonError(403, "Forbidden");
  // Cookie path: refuse cross-site requests before reading the session.
  if (!request.headers.has("authorization") && !isSameOrigin(request))
    return jsonError(403, "Forbidden");
  const identity = await resolveRequestIdentity(request);
  const refused = identityRefusal(identity);
  if (refused) return refused;
  if (!isTrustedMutation(request, isBearerIdentity(identity)))
    return jsonError(403, "Forbidden");
  if (identity.kind !== "authenticated") return jsonError(401, "Sign in first");
  if (!isDatabaseConfigured())
    return jsonError(503, "Chats can't be saved yet");

  const parsed = tabChatsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return jsonError(400, "Unexpected chat data");

  const result = await importTabChats(
    getDb(),
    identity.userId,
    parsed.data.chats,
  );
  return Response.json(result, { headers: NO_STORE });
}
