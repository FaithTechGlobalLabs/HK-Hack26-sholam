import { getDb, isDatabaseConfigured } from "@/db";
import { importTabChats, tabChatsSchema } from "@/lib/chat/store";
import { isJson, isSameOrigin, jsonError, NO_STORE } from "@/lib/http";
import { currentUserId } from "@/lib/supabase/server";

/**
 * Keeps the chats from a signed-out tab (sessionStorage history) in the
 * signed-in account. Text only: imported answers carry no verse records.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request) || !isJson(request))
    return jsonError(403, "Forbidden");
  const userId = await currentUserId();
  if (!userId) return jsonError(401, "Sign in first");
  if (!isDatabaseConfigured())
    return jsonError(503, "Chats can't be saved yet");

  const parsed = tabChatsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return jsonError(400, "Unexpected chat data");

  const result = await importTabChats(getDb(), userId, parsed.data.chats);
  return Response.json(result, { headers: NO_STORE });
}
