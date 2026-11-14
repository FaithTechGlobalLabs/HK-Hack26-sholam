import type { ReactNode } from "react";
import type { VerseRecord } from "@/lib/agent/events";

/**
 * Inline citation. Verified (a tool returned the verse this turn): a chip
 * with the verse text on hover. Otherwise: the label, marked unverified.
 */
export function VerseChip({
  verse,
  label,
}: {
  verse?: VerseRecord;
  label: ReactNode;
}) {
  if (!verse) {
    return (
      <span
        className="text-muted-foreground"
        title="This citation was not checked against the Bible text."
      >
        {label}
        <sup className="ml-0.5 text-[11px] text-white/90 uppercase tracking-wide">
          unverified
        </sup>
      </span>
    );
  }
  return (
    <span className="group relative inline-block">
      <span
        className="cursor-help rounded-full bg-white/85 px-2 py-0.5 font-medium text-[#1f4f9e] text-xs align-middle [text-shadow:none]"
        title={`${verse.label} (${verse.translation}): ${verse.text}`}
      >
        {label}
      </span>
    </span>
  );
}
