import { connection } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { listChats } from "@/lib/chat/store";
import { NO_STORE } from "@/lib/http";
import {
  identityRefusal,
  resolveRequestIdentity,
} from "@/lib/supabase/request-auth";

/** The signed-in person's saved chats, newest first (web cookie or native Bearer). */
export async function GET(request: Request) {
  await connection();
  const identity = await resolveRequestIdentity(request);
  const refused = identityRefusal(identity);
  if (refused) return refused;
  if (identity.kind !== "authenticated")
    return Response.json(
      { chats: [], signedIn: false },
      { status: 401, headers: NO_STORE },
    );
  if (!isDatabaseConfigured())
    return Response.json(
      { chats: [], signedIn: true, stored: false },
      { headers: NO_STORE },
    );
  const chats = await listChats(getDb(), identity.userId);
  return Response.json(
    { chats, signedIn: true, stored: true },
    { headers: NO_STORE },
  );
}
