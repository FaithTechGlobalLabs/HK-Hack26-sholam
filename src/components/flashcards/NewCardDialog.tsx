"use client";

import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  flashcardDraftSchema,
  TONES,
} from "@/lib/flashcards/types";
import { saveFlashcard } from "./saveFlashcard";

/** Manual card form. Refs are verse ids for now; Phase 3 accepts "John 3:16". */
export function NewCardDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = flashcardDraftSchema.safeParse({
      question: form.get("question"),
      answer: form.get("answer"),
      explanation: form.get("explanation") || undefined,
      refs: String(form.get("refs") ?? "")
        .split(/[\s,]+/)
        .filter(Boolean),
      category: form.get("category"),
      tone: form.get("tone"),
    });
    if (!parsed.success) {
      setMessage(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      return;
    }
    setSaving(true);
    const error = await saveFlashcard(parsed.data);
    setSaving(false);
    if (error) setMessage(error);
    else onClose();
  };

  const field = "rounded-lg border bg-background px-3 py-2";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New card"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
    >
      <form
        onSubmit={submit}
        className="flex w-full max-w-lg flex-col gap-3 rounded-2xl bg-background p-5 backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">New flashcard</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        <input
          name="question"
          required
          placeholder="Question"
          className={field}
        />
        <input name="answer" required placeholder="Answer" className={field} />
        <textarea
          name="explanation"
          placeholder="Explanation (optional)"
          className={field}
          rows={2}
        />
        <input
          name="refs"
          required
          placeholder="Verse ids, e.g. JHN.11.35 LUK.19.4"
          className={field}
        />
        <div className="flex gap-3">
          <select
            name="category"
            className={`${field} flex-1`}
            defaultValue="fun-facts"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select name="tone" className={`${field} flex-1`} defaultValue="fun">
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {message && <p className="text-muted-foreground text-sm">{message}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add to the public deck"}
        </Button>
      </form>
    </div>
  );
}
