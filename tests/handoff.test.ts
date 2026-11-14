import { beforeEach, describe, expect, it } from "vitest";
import { queueChatQuestion, takeChatQuestion } from "@/lib/chat/handoff";

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
}

describe("chat hand-off", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it("delivers a queued question exactly once", () => {
    queueChatQuestion("Help me explore this question");
    expect(takeChatQuestion()).toBe("Help me explore this question");
    expect(takeChatQuestion()).toBeNull();
  });

  it("ignores stale or malformed entries", () => {
    queueChatQuestion("old");
    expect(takeChatQuestion(Date.now() + 11_000)).toBeNull();
    sessionStorage.setItem("sholam:ask", "{not json");
    expect(takeChatQuestion()).toBeNull();
    sessionStorage.setItem(
      "sholam:ask",
      JSON.stringify({ q: 42, at: Date.now() }),
    );
    expect(takeChatQuestion()).toBeNull();
  });
});
