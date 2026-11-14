import { Suspense } from "react";
import { ChatView } from "@/components/shell/ChatView";
import { SectionTransition } from "@/components/shell/SectionTransition";

/** An existing chat. Phase 2: load its stored messages for the signed-in owner. */
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
  return <ChatView chatId={chatId} suggestions={[]} />;
}
