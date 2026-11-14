import { Suspense } from "react";
import { ChatView } from "@/components/shell/ChatView";

/** An existing chat. Phase 2: load its stored messages for the signed-in owner. */
export default function ChatPage({ params }: PageProps<"/c/[chatId]">) {
  return (
    <Suspense fallback={null}>
      <ExistingChat params={params} />
    </Suspense>
  );
}

async function ExistingChat({
  params,
}: Pick<PageProps<"/c/[chatId]">, "params">) {
  const { chatId } = await params;
  return <ChatView chatId={chatId} suggestions={[]} />;
}
