import { bundledDeck } from "./deck";
import type { AgentEvent, Flashcard, UsageSnapshot } from "./types";

const EVENT_TYPES = new Set([
  "text_delta",
  "reset",
  "tool_start",
  "tool_result",
  "verses",
  "flashcards",
  "flashcard_proposal",
  "error",
  "done",
  "citations",
]);

class SseDecoder {
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
  if (!EVENT_TYPES.has(type)) return null;
  try {
    const payload = data.length ? (JSON.parse(data.join("\n")) as object) : {};
    return { type, ...payload } as AgentEvent;
  } catch {
    return null;
  }
}

function headers(
  deviceId: string,
  customerId: string | null,
): Record<string, string> {
  const next: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-shalom-client": "ios",
    "x-shalom-device": deviceId,
  };
  if (customerId) next["x-shalom-customer"] = customerId;
  return next;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    missing?: string[];
  } | null;
  const missing = body?.missing?.length
    ? ` Missing: ${body.missing.join(", ")}.`
    : "";
  return `${body?.error ?? `Request failed (${response.status}).`}${missing}`;
}

export async function fetchUsage(
  apiBase: string,
  deviceId: string,
  customerId: string | null,
): Promise<UsageSnapshot> {
  const response = await fetch(`${apiBase}/api/billing/usage`, {
    headers: headers(deviceId, customerId),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as UsageSnapshot;
}

export async function createCheckout(
  apiBase: string,
  deviceId: string,
  interval: "month" | "year",
): Promise<string> {
  const response = await fetch(`${apiBase}/api/billing/checkout`, {
    method: "POST",
    headers: headers(deviceId, null),
    body: JSON.stringify({ deviceId, interval }),
  });
  const body = (await response.json().catch(() => null)) as {
    url?: string;
    error?: string;
    missing?: string[];
  } | null;
  if (!response.ok || !body?.url) {
    const missing = body?.missing?.length
      ? ` Missing: ${body.missing.join(", ")}.`
      : "";
    throw new Error(`${body?.error ?? "Checkout is unavailable."}${missing}`);
  }
  return body.url;
}

export async function confirmCheckout(
  apiBase: string,
  deviceId: string,
  sessionId: string,
): Promise<{ usage: UsageSnapshot; pending: boolean }> {
  const response = await fetch(`${apiBase}/api/billing/confirm`, {
    method: "POST",
    headers: headers(deviceId, null),
    body: JSON.stringify({ deviceId, sessionId }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as { usage: UsageSnapshot; pending: boolean };
}

export async function createPortal(
  apiBase: string,
  deviceId: string,
  customerId: string,
): Promise<string> {
  const response = await fetch(`${apiBase}/api/billing/portal`, {
    method: "POST",
    headers: headers(deviceId, customerId),
    body: JSON.stringify({ deviceId, customerId }),
  });
  const body = (await response.json().catch(() => null)) as {
    url?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.url) {
    throw new Error(body?.error ?? "The billing portal is unavailable.");
  }
  return body.url;
}

export async function loadDeck(apiBase: string): Promise<Flashcard[]> {
  try {
    const response = await fetch(`${apiBase}/api/flashcards?limit=200`);
    if (!response.ok) return bundledDeck();
    const body = (await response.json()) as { cards?: Flashcard[] };
    if (Array.isArray(body.cards) && body.cards.length > 0) return body.cards;
  } catch {
    // The bundled seed is the same deck the server uses without a database.
  }
  return bundledDeck();
}

export function streamChat(options: {
  apiBase: string;
  deviceId: string;
  customerId: string | null;
  chatId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  onEvent: (event: AgentEvent) => void;
  signal: AbortSignal;
}): Promise<void> {
  const { onEvent, signal } = options;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const decoder = new SseDecoder();
    let seen = 0;
    let got = false;
    const pump = () => {
      const text = xhr.responseText ?? "";
      if (text.length <= seen) return;
      const events = decoder.push(text.slice(seen));
      seen = text.length;
      for (const event of events) {
        got = true;
        onEvent(event);
      }
    };
    xhr.open("POST", `${options.apiBase}/api/chat`);
    const requestHeaders = headers(options.deviceId, options.customerId);
    requestHeaders.Accept = "text/event-stream";
    for (const [key, value] of Object.entries(requestHeaders)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.onprogress = pump;
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) pump();
    };
    xhr.onload = () => {
      pump();
      if (xhr.status === 429 || (xhr.status >= 400 && !got)) {
        let message = `The guide could not answer (${xhr.status}).`;
        let code: string | undefined;
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: string;
            code?: string;
          };
          if (body.error) message = body.error;
          code = body.code;
        } catch {
          // The body was not JSON.
        }
        onEvent({ type: "error", message, code });
      }
      resolve();
    };
    xhr.onerror = () => reject(new Error("Could not reach Shalom Guide."));
    xhr.onabort = () => resolve();
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(
      JSON.stringify({
        chatId: options.chatId,
        message: options.message,
        history: options.history,
      }),
    );
  });
}
