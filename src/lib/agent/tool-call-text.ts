/**
 * Some free models (Nemotron on OpenRouter) sometimes write a tool call into
 * the streamed answer text instead of sending a `tool_calls` delta:
 *
 *   <tool_call><function=lookup_verses><parameter=references>["Numbers 22"]
 *   </parameter></function></tool_call>
 *
 * or the Hermes JSON form `<tool_call>{"name": ..., "arguments": {...}}</tool_call>`.
 * This filter takes answer text chunk by chunk, holds back anything that could
 * be the start of such a block (so a split tag never reaches the user), and
 * turns complete blocks into real tool calls. Works like reasoning-filter.ts.
 */

import type { ToolCall } from "./openai-types";

const OPENERS = [
  { open: "<tool_call>", close: "</tool_call>" },
  { open: "<function=", close: "</function>" },
] as const;

/** Closing tags the model sometimes leaves behind on their own. */
const STRAY = /<\/(?:tool_call|function|parameter)>/g;

/** Tags to hold back while only part of them has arrived. */
const HELD_TAGS = [
  ...OPENERS.map((o) => o.open),
  "</tool_call>",
  "</function>",
  "</parameter>",
];

export interface ToolCallTextResult {
  text: string;
  calls: ToolCall[];
  /** An unfinished or unreadable block was dropped. */
  malformed: boolean;
}

export function createToolCallTextFilter(idPrefix = "text_call") {
  let pending = "";
  let block: { close: string; body: string } | null = null;
  const calls: ToolCall[] = [];
  let malformed = false;

  const addCall = (body: string) => {
    const parsed = parseToolCallBlock(body);
    if (parsed) {
      calls.push({
        id: `${idPrefix}_${calls.length + 1}`,
        type: "function",
        function: parsed,
      });
    } else {
      malformed = true;
    }
  };

  function push(chunk: string): string {
    pending += chunk;
    let visible = "";

    for (;;) {
      if (block) {
        const end = pending.indexOf(block.close);
        if (end === -1) {
          block.body += pending;
          pending = "";
          break;
        }
        block.body += pending.slice(0, end);
        pending = pending.slice(end + block.close.length);
        addCall(block.body);
        block = null;
        continue;
      }

      let first: { at: number; open: string; close: string } | null = null;
      for (const o of OPENERS) {
        const at = pending.indexOf(o.open);
        if (at !== -1 && (!first || at < first.at))
          first = { at, open: o.open, close: o.close };
      }
      if (!first) {
        const hold = partialOpenerAt(pending);
        visible += pending.slice(0, hold);
        pending = pending.slice(hold);
        break;
      }
      visible += pending.slice(0, first.at);
      // Keep `<function=` in the body: it names the function.
      block = {
        close: first.close,
        body: first.open === "<function=" ? first.open : "",
      };
      pending = pending.slice(first.at + first.open.length);
    }

    return visible.replace(STRAY, "");
  }

  function flush(): ToolCallTextResult {
    let text = "";
    if (block) {
      // Cut off mid-block (max_tokens): keep it only if it still parses.
      addCall(block.body + pending);
      block = null;
    } else {
      text = pending.replace(STRAY, "");
    }
    pending = "";
    return { text, calls: [...calls], malformed };
  }

  return { push, flush };
}

/** Index where a possible tag prefix starts at the end of `text`, else its length. */
function partialOpenerAt(text: string): number {
  const lt = text.lastIndexOf("<");
  if (lt === -1) return text.length;
  const tail = text.slice(lt);
  return HELD_TAGS.some(
    (tag) => tag.startsWith(tail) && tail.length < tag.length,
  )
    ? lt
    : text.length;
}

/** `{ name, arguments }` from one block body, or null if it is unreadable. */
export function parseToolCallBlock(
  body: string,
): { name: string; arguments: string } | null {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as {
        name?: unknown;
        arguments?: unknown;
        parameters?: unknown;
      };
      if (typeof json.name !== "string" || !json.name) return null;
      const args = json.arguments ?? json.parameters ?? {};
      return {
        name: json.name,
        arguments: typeof args === "string" ? args : JSON.stringify(args),
      };
    } catch {
      return null;
    }
  }

  const fn = /<function=([A-Za-z0-9_.-]+)\s*>/.exec(trimmed);
  if (!fn) return null;
  const inner = trimmed.slice(fn.index + fn[0].length);
  const params: Record<string, unknown> = {};
  let found = false;
  for (const m of inner.matchAll(
    /<parameter=([A-Za-z0-9_.-]+)\s*>([\s\S]*?)<\/parameter>/g,
  )) {
    params[m[1]] = coerceValue(m[2]);
    found = true;
  }
  if (!found) {
    // `<function=name>{"references": [...]}</function>`
    const rest = inner.replace(STRAY, "").trim();
    if (rest.startsWith("{")) {
      try {
        return { name: fn[1], arguments: JSON.stringify(JSON.parse(rest)) };
      } catch {
        return null;
      }
    }
    if (rest) return null;
  }
  return { name: fn[1], arguments: JSON.stringify(params) };
}

function coerceValue(raw: string): unknown {
  const value = raw.trim();
  if (/^[[{]/.test(value) || /^(-?\d+(\.\d+)?|true|false|null)$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
