/**
 * Server-sent events from `POST /api/chat` to the browser. One event per
 * SSE frame: `event: <type>` + `data: <json>`. The browser reads the stream
 * with fetch + ReadableStream (EventSource cannot POST) and `SseDecoder`.
 */

import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";
import type { CitationIssue } from "./citations";

export interface VerseRecord {
  /** `JHN.3.16` */
  id: string;
  /** `John 3:16` */
  label: string;
  text: string;
  translation: string;
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
    }
  | { type: "verses"; verses: VerseRecord[] }
  | { type: "flashcards"; cards: FlashcardSummary[] }
  | { type: "flashcard_proposal"; draft: FlashcardDraft }
  /**
   * Replace the answer text streamed so far with `text` (default empty):
   * a preamble before a tool call, a draft before its corrected rewrite,
   * the draft restored when the rewrite failed, or the final answer with
   * its plain references linked by the server (`verse_links`, sent just
   * before `citations`).
   */
  | {
      type: "reset";
      reason: "tool_call" | "verse_check" | "restore" | "verse_links";
      text?: string;
    }
  /**
   * Final citation check, sent before `done`. Listed verse links show as
   * unverified even if their text was fetched; `quoteWarnings` names plain
   * references whose quoted words were not checked.
   */
  | {
      type: "citations";
      unverified: CitationIssue[];
      quoteWarnings: string[];
    }
  | { type: "done"; messageId?: string; stopReason: string }
  | { type: "error"; message: string };

export type AgentEventType = AgentEvent["type"];

const EVENT_TYPES = new Set<AgentEventType>([
  "text_delta",
  "tool_start",
  "tool_result",
  "verses",
  "flashcards",
  "flashcard_proposal",
  "reset",
  "citations",
  "done",
  "error",
]);

export function encodeEvent(event: AgentEvent): string {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Wraps an async event source as an SSE `Response` body. Pulls one event at
 * a time, so nothing runs ahead of the client. When the client goes away
 * (`cancel`), `onCancel` runs first (abort the model call), then the source
 * is told to stop.
 */
export function eventStream(
  events: AsyncIterable<AgentEvent>,
  options: { onCancel?: () => void } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let closed = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (closed) return;
        if (next.done) {
          closed = true;
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeEvent(next.value)));
      } catch (err) {
        if (closed) return;
        closed = true;
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(encodeEvent({ type: "error", message })),
        );
        controller.close();
      }
    },
    cancel() {
      closed = true;
      options.onCancel?.();
      // Don't await: a generator busy in a model call returns once the
      // abort above unblocks it.
      iterator.return?.(undefined)?.catch(() => undefined);
    },
  });
}

/**
 * Incremental SSE parser. Feed it text chunks in any split; it returns the
 * complete events seen so far. Unknown event types and malformed JSON are
 * dropped rather than thrown, so one bad frame cannot kill the stream.
 */
export class SseDecoder {
  private buffer = "";

  push(chunk: string): AgentEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: AgentEvent[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseFrame(frame);
      if (event) events.push(event);
      boundary = this.buffer.indexOf("\n\n");
    }
    return events;
  }
}

function parseFrame(frame: string): AgentEvent | null {
  let type = "";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!EVENT_TYPES.has(type as AgentEventType)) return null;
  try {
    const payload = data.length ? JSON.parse(data.join("\n")) : {};
    return { type, ...payload } as AgentEvent;
  } catch {
    return null;
  }
}
