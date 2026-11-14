import type { ReactNode } from "react";
import type { IssueReason } from "@/lib/agent/citations";
import type { VerseRecord } from "@/lib/agent/events";

const UNVERIFIED_TITLE: Record<IssueReason | "default", string> = {
  not_fetched: "This verse was not looked up before the answer was written.",
  quote_mismatch:
    "The quoted words do not match the Bible text for this verse.",
  default: "This citation was not checked against the Bible text.",
};

/**
 * Inline citation. Verified (a tool returned the verse before the answer and
 * any quoted words match): a chip with the verse text on hover. Otherwise:
 * the label, marked unverified, with the reason on hover.
 */
export function VerseChip({
  verse,
  label,
  reason,
}: {
  verse?: VerseRecord;
  label: ReactNode;
  reason?: IssueReason;
}) {
  if (!verse) {
    return (
      <span
        className="text-muted-foreground"
        title={UNVERIFIED_TITLE[reason ?? "default"]}
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
