/**
 * Hand a question from another view (a held flashcard) to chat so it is
 * sent once, without putting "send this" in the URL. A URL flag such as
 * `?send=1` would let any link or hidden iframe fire a paid model call
 * through a visitor's browser; sessionStorage is same-origin and one-shot.
 * `?q=` in the URL still works, but only pre-fills the composer.
 */

const KEY = "sholam:ask";
const MAX_AGE_MS = 10_000;

export function queueChatQuestion(question: string): void {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ q: question, at: Date.now() }),
    );
  } catch {
    // Storage unavailable (private mode quotas): chat simply opens empty.
  }
}

/** Returns the queued question once (then forgets it), if it is fresh. */
export function takeChatQuestion(now: number = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { q, at } = JSON.parse(raw) as { q?: unknown; at?: unknown };
    if (
      typeof q !== "string" ||
      typeof at !== "number" ||
      now - at > MAX_AGE_MS ||
      now < at
    )
      return null;
    return q.slice(0, 4000);
  } catch {
    return null;
  }
}
