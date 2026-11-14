"use client";

import { ArrowUp, Square } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
}: ComposerProps) {
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    onChange("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing)
      submit(e);
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 rounded-3xl border bg-background p-2 shadow-sm"
    >
      <textarea
        aria-label="Message"
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything"
        className="field-sizing-content max-h-48 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 outline-none"
      />
      {busy ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="rounded-full bg-foreground p-2 text-background"
        >
          <Square className="size-4" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!value.trim()}
          className="rounded-full bg-foreground p-2 text-background disabled:opacity-30"
        >
          <ArrowUp className="size-4" />
        </button>
      )}
    </form>
  );
}
