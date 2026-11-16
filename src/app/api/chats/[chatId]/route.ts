import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { loadChat } from "@/lib/chat/store";
import { jsonError, NO_STORE } from "@/lib/http";
import {
  identityRefusal,
  resolveRequestIdentity,
} from "@/lib/supabase/request-auth";

/**
 * One saved chat with its messages, for its owner only. Anyone else (and
 * any id that was never saved) gets the same 404. A rejected Bearer token
 * gets 401 so the native app knows to sign in again.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/chats/[chatId]">,
) {
  await connection();
  const { chatId } = await ctx.params;
  const identity = await resolveRequestIdentity(request);
  const refused = identityRefusal(identity);
  if (refused) return refused;
  if (identity.kind !== "authenticated" || !isDatabaseConfigured())
    return jsonError(404, "Not found");
  const found = await loadChat(getDb(), identity.userId, chatId);
  if (found.status !== "owned") return jsonError(404, "Not found");
  return Response.json(
    { chat: found.chat, messages: found.messages },
    { headers: NO_STORE },
  );
}
