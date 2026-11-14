"use client";

import { useState } from "react";

/**
 * Shown to a signed-in person whose tab still holds chats the account
 * doesn't have (chats from before they signed in). One tap keeps them.
 */
export function KeepTabChats({
  count,
  onKeep,
}: {
  count: number;
  onKeep: () => Promise<boolean>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  const keep = async () => {
    setState("saving");
    setState((await onKeep()) ? "idle" : "failed");
  };

  return (
    <div className="mb-2 rounded-xl bg-white/12 px-3 py-2.5 text-[13px] text-white leading-snug">
      <p>
        {count === 1
          ? "1 chat from this tab isn't in your account yet."
          : `${count} chats from this tab aren't in your account yet.`}
      </p>
      <button
        type="button"
        onClick={keep}
        disabled={state === "saving"}
        className="mt-1 rounded-md font-medium underline decoration-white/60 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80 disabled:no-underline disabled:opacity-80"
      >
        {state === "saving"
          ? "Saving…"
          : state === "failed"
            ? "Couldn't save. Try again"
            : count === 1
              ? "Keep it"
              : "Keep them"}
      </button>
    </div>
  );
}
