import { LettersView } from "@/components/letters/LettersView";
import { LETTERS } from "@/lib/letters";

export default function LettersPage() {
  return <LettersView letters={LETTERS} />;
}
