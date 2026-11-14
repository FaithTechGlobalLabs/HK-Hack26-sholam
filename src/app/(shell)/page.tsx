import { ChatView } from "@/components/shell/ChatView";
import { SectionTransition } from "@/components/shell/SectionTransition";

const SUGGESTIONS = [
  "Who is Jesus?",
  "Did a donkey really talk in the Bible?",
  "Why does God allow suffering?",
  "What if I have doubts about God?",
];

export default function NewChatPage() {
  return (
    <SectionTransition>
      <ChatView suggestions={SUGGESTIONS} />
    </SectionTransition>
  );
}
