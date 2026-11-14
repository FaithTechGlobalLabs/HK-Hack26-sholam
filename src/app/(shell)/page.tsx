import { ChatView } from "@/components/shell/ChatView";
import { SEED_FLASHCARDS } from "@/lib/flashcards/repo";

// Phase 3: draw these from the live deck at random.
const SUGGESTIONS = SEED_FLASHCARDS.slice(0, 4).map((card) => card.question);

export default function NewChatPage() {
  return <ChatView suggestions={SUGGESTIONS} />;
}
