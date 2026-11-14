/**
 * Server-sent events from `POST /api/chat` to the browser. One event per
 * SSE frame: `event: <type>` + `data: <json>`. The browser reads the stream
 * with fetch + ReadableStream (EventSource cannot POST) and `SseDecoder`.
 */

import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";

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
  "done",
  "error",
]);

export function encodeEvent(event: AgentEvent): string {
  const { type, ...data } = event;
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Wraps an async event source as an SSE `Response` body. */
export function eventStream(
  events: AsyncIterable<AgentEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events)
          controller.enqueue(encoder.encode(encodeEvent(event)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(encodeEvent({ type: "error", message })),
        );
      } finally {
        controller.close();
      }
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
