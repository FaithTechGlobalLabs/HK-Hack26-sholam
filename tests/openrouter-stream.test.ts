import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChatCompletion } from "@/lib/agent/openrouter";
import {
  type OpenRouterConfig,
  TurnAborted,
} from "@/lib/agent/openrouter-config";

// A paid-looking id skips the free-model pacing gate; nothing is called for real.
const config: OpenRouterConfig = {
  apiKey: "test-key",
  baseUrl: "https://openrouter.test/api/v1",
  model: "test/model",
  maxTokens: 50,
  maxSteps: 4,
};

function sse(frames: unknown[], splitEvery = 0): Response {
  const wire = `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("")}data: [DONE]\n\n`;
  const parts =
    splitEvery > 0
      ? Array.from({ length: Math.ceil(wire.length / splitEvery) }, (_, i) =>
          wire.slice(i * splitEvery, (i + 1) * splitEvery),
        )
      : [wire];
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const p of parts) controller.enqueue(encoder.encode(p));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

const content = (text: string) => ({ choices: [{ delta: { content: text } }] });
const finish = (reason: string) => ({
  choices: [{ delta: {}, finish_reason: reason }],
});

async function drain(
  gen: AsyncGenerator<{ type: string; text?: string; toolCalls?: unknown[] }>,
) {
  const out = [];
  for await (const c of gen) out.push(c);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("streamChatCompletion", () => {
  it("turns a tool call written as text into a real call, leaking nothing", async () => {
    const pieces = [
      "<tool",
      "_call>\n<function=lookup_",
      'verses>\n<parameter=references>\n["Numbers 22:21-35"]\n</parameter>\n</function>\n</tool',
      "_call>",
    ];
    for (const split of [0, 7]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => sse([...pieces.map(content), finish("stop")], split)),
      );
      const chunks = await drain(
        streamChatCompletion({
          messages: [{ role: "user", content: "donkey?" }],
          config,
        }),
      );
      const text = chunks
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(text).toBe("");
      const done = chunks.find((c) => c.type === "tool_calls_done");
      expect(done?.toolCalls).toEqual([
        {
          id: "text_call_1",
          type: "function",
          function: {
            name: "lookup_verses",
            arguments: '{"references":["Numbers 22:21-35"]}',
          },
        },
      ]);
    }
  });

  it("still accumulates native tool_calls deltas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sse([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "t1",
                      function: {
                        name: "search_bible",
                        arguments: '{"query":',
                      },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"peace"}' } },
                  ],
                },
              },
            ],
          },
          finish("tool_calls"),
        ]),
      ),
    );
    const chunks = await drain(
      streamChatCompletion({
        messages: [{ role: "user", content: "q" }],
        config,
      }),
    );
    expect(chunks.find((c) => c.type === "tool_calls_done")?.toolCalls).toEqual(
      [
        {
          id: "t1",
          type: "function",
          function: { name: "search_bible", arguments: '{"query":"peace"}' },
        },
      ],
    );
  });

  it("sends the tool list with tool_choice none when tools are not offered", async () => {
    const fetchMock = vi.fn(async () => sse([content("Hi"), finish("stop")]));
    vi.stubGlobal("fetch", fetchMock);
    await drain(
      streamChatCompletion({
        messages: [{ role: "user", content: "q" }],
        tools: [
          {
            type: "function",
            function: {
              name: "x",
              description: "d",
              parameters: { type: "object" },
            },
          },
        ],
        toolChoice: "none",
        config,
      }),
    );
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls[0] as unknown[])[1] &&
          ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body,
      ),
    );
    expect(body.tool_choice).toBe("none");
    expect(body.tools).toHaveLength(1);
    expect(body.max_tokens).toBe(50);
  });

  it("stops a retry wait on abort instead of retrying", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("busy", { status: 429, headers: { "retry-after": "5" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const run = drain(
      streamChatCompletion({
        messages: [{ role: "user", content: "q" }],
        config,
        signal: controller.signal,
      }),
    );
    setTimeout(() => controller.abort(), 20);
    await expect(run).rejects.toBeInstanceOf(TurnAborted);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted stream as stopped, not as a timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                encoder.encode(`data: ${JSON.stringify(content("Hel"))}\n\n`),
              );
              init.signal?.addEventListener("abort", () =>
                c.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
        );
      }),
    );
    const seen: string[] = [];
    const run = (async () => {
      for await (const c of streamChatCompletion({
        messages: [{ role: "user", content: "q" }],
        config,
        signal: controller.signal,
      })) {
        if (c.text) seen.push(c.text);
        controller.abort();
      }
    })();
    await expect(run).rejects.toBeInstanceOf(TurnAborted);
    expect(seen).toEqual(["Hel"]);
  });
});
