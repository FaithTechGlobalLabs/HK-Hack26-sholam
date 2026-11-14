import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { listChats } from "@/lib/chat/store";
import { NO_STORE } from "@/lib/http";
import { currentUserId } from "@/lib/supabase/server";

/** The signed-in person's saved chats, newest first. */
export async function GET() {
  await connection();
  const userId = await currentUserId();
  if (!userId)
    return Response.json(
      { chats: [], signedIn: false },
      { status: 401, headers: NO_STORE },
    );
  if (!isDatabaseConfigured())
    return Response.json(
      { chats: [], signedIn: true, stored: false },
      { headers: NO_STORE },
    );
  const chats = await listChats(getDb(), userId);
  return Response.json(
    { chats, signedIn: true, stored: true },
    { headers: NO_STORE },
  );
}
