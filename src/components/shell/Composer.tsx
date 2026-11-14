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
      className="glass flex items-end gap-2 rounded-3xl p-2 transition-shadow duration-500 focus-within:shadow-xl"
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
          className="glass-btn rounded-full bg-white/85 p-2 text-[#2f68c2] hover:bg-white"
        >
          <Square className="size-4" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!value.trim()}
          className="glass-btn rounded-full bg-white/85 p-2 text-[#2f68c2] hover:bg-white disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      )}
    </form>
  );
}
