"use client";

import { X } from "lucide-react";
import type { VerseRecord } from "@/lib/agent/events";

/** Right-hand panel listing the verses behind an answer. */
export function SourcesPanel({
  verses,
  onClose,
}: {
  verses: VerseRecord[];
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Sources"
      className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l bg-background md:static md:z-auto"
    >
      <div className="flex h-12 items-center justify-between border-b px-4">
        <h2 className="font-medium text-sm">Sources</h2>
        <button
          type="button"
          aria-label="Close sources"
          onClick={onClose}
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <ol className="flex-1 space-y-4 overflow-y-auto p-4">
        {verses.map((v) => (
          <li key={v.id}>
            <p className="font-medium text-sm">
              {v.label}{" "}
              <span className="text-muted-foreground text-xs">
                {v.translation}
              </span>
            </p>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {v.text}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
