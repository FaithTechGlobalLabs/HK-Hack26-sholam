import { z } from "zod";
import { demoTurn } from "@/lib/agent/demo";
import { eventStream } from "@/lib/agent/events";
import { runAgentTurn } from "@/lib/agent/harness";
import { currentUserId } from "@/lib/supabase/server";

const bodySchema = z.strictObject({
  chatId: z.string().optional(),
  message: z.string().trim().min(1).max(8000),
});

/**
 * Streams one assistant turn as server-sent events (see lib/agent/events.ts).
 * Uses the scripted demo until SHOLAM_AGENT=live and the loop is built.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { message: string, chatId?: string }" },
      { status: 400 },
    );
  }
  const { chatId, message } = parsed.data;

  const events =
    process.env.SHOLAM_AGENT === "live"
      ? runAgentTurn({
          chatId: chatId ?? crypto.randomUUID(),
          userId: await currentUserId(),
          userMessage: message,
        })
      : demoTurn(message);

  return new Response(eventStream(events), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
