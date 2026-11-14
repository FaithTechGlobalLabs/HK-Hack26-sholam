import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { loadChat } from "@/lib/chat/store";
import { jsonError, NO_STORE } from "@/lib/http";
import { currentUserId } from "@/lib/supabase/server";

/**
 * One saved chat with its messages, for its owner only. Anyone else (and
 * any id that was never saved) gets the same 404.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/chats/[chatId]">,
) {
  await connection();
  const { chatId } = await ctx.params;
  const userId = await currentUserId();
  if (!userId || !isDatabaseConfigured()) return jsonError(404, "Not found");
  const found = await loadChat(getDb(), userId, chatId);
  if (found.status !== "owned") return jsonError(404, "Not found");
  return Response.json(
    { chat: found.chat, messages: found.messages },
    { headers: NO_STORE },
  );
}
