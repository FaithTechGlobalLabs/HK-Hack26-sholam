"use client";

import { Popover } from "@base-ui/react/popover";
import { BookOpen, Check, CircleHelp } from "lucide-react";
import type { IssueReason } from "@/lib/agent/citations";
import type { VerseRecord } from "@/lib/agent/events";
import { verseNumber } from "@/lib/chat/cited-verses";
import { cn } from "@/lib/utils";

const NOT_CHECKED: Record<IssueReason | "default", string> = {
  not_fetched:
    "Shalom did not look this passage up before writing the answer, so its wording here may not match the Bible text.",
  quote_mismatch:
    "The words quoted for this passage do not match the Bible text Shalom looked up.",
  default: "This reference was not checked against the Bible text.",
};

/**
 * An inline Bible reference in an answer. It reads as a small pill with a
 * book icon; tap it (or hover on desktop) for a card with the passage text
 * Shalom looked up. A reference that was not checked has a dashed outline
 * and a question mark, and its card says why, in plain words.
 */
export function VerseChip({
  label,
  verses,
  reason,
}: {
  /** The reference as written in the answer, e.g. "John 1:1–3". */
  label: string;
  /** Fetched verses in the cited range; empty when not checked. */
  verses: VerseRecord[];
  reason?: IssueReason;
}) {
  const checked = verses.length > 0 && !reason;
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={250}
        closeDelay={120}
        className={cn(
          "verse-ref mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px align-[0.08em] font-medium text-[13px] leading-5 [text-shadow:none]",
          checked ? "verse-ref-checked" : "verse-ref-unchecked",
        )}
      >
        {checked ? (
          <BookOpen aria-hidden className="size-3.5 shrink-0" />
        ) : (
          <CircleHelp aria-hidden className="size-3.5 shrink-0" />
        )}
        {label}
        {!checked && <span className="sr-only"> (not checked)</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="verse-card max-h-[min(60dvh,26rem)] w-[min(22rem,calc(100vw-24px))] overflow-y-auto rounded-2xl p-4">
            <Popover.Title className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-[15px]">{label}</span>
              <span className="shrink-0 text-[12px] text-[color:var(--verse-muted)]">
                {checked ? "Berean Standard Bible" : "Not checked"}
              </span>
            </Popover.Title>
            {checked ? (
              <>
                <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed">
                  {verses.map((v) => (
                    <p key={v.id}>
                      <sup className="mr-1 font-semibold text-[11px] text-[color:var(--verse-accent)]">
                        {verseNumber(v.id)}
                      </sup>
                      {v.text}
                    </p>
                  ))}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[color:var(--verse-muted)]">
                  <Check aria-hidden className="size-3.5" />
                  Looked up before answering
                </p>
              </>
            ) : (
              <Popover.Description className="mt-2 text-[14px] text-[color:var(--verse-muted)] leading-relaxed">
                {NOT_CHECKED[reason ?? "default"]}
              </Popover.Description>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
