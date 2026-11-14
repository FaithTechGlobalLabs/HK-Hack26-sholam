import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/shell/ChatView";
import { SectionTransition } from "@/components/shell/SectionTransition";
import { getDb, isDatabaseConfigured } from "@/db";
import { loadChat } from "@/lib/chat/store";
import { currentUserId } from "@/lib/supabase/server";

/**
 * An existing chat. A chat saved to an account opens, with its messages,
 * only for its owner; anyone else (signed out included) gets the
 * not-found page. An id with no saved chat is a signed-out tab's chat,
 * which ChatView reads from the tab's own history.
 */
export default function ChatPage({ params }: PageProps<"/c/[chatId]">) {
  return (
    <SectionTransition>
      <Suspense fallback={null}>
        <ExistingChat params={params} />
      </Suspense>
    </SectionTransition>
  );
}

async function ExistingChat({
  params,
}: Pick<PageProps<"/c/[chatId]">, "params">) {
  const { chatId } = await params;
  if (isDatabaseConfigured()) {
    const found = await loadChat(getDb(), await currentUserId(), chatId).catch(
      () => null,
    );
    if (found?.status === "not-yours") notFound();
    if (found?.status === "owned")
      return (
        <ChatView
          chatId={chatId}
          suggestions={[]}
          initialMessages={found.messages}
        />
      );
  }
  return <ChatView chatId={chatId} suggestions={[]} />;
}
