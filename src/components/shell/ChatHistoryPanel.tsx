"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useLocalChats } from "@/lib/chat/use-local-chats";
import { cn } from "@/lib/utils";

/**
 * Recent chats (MustyDusty's sessionStorage history) in a panel opened from
 * the dock's Chats item on phones; desktop lists them in the sidebar.
 * Postgres-backed history replaces the source in Phase 2.
 */
export function ChatHistoryPanel({
  pathname,
  onClose,
}: {
  pathname: string | null;
  onClose: () => void;
}) {
  const chats = useLocalChats();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close chats"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <section
        aria-label="Chats"
        className="glass fixed bottom-28 left-1/2 z-50 flex max-h-[60dvh] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-3xl p-2"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="font-medium text-sm">Chats</h2>
          <button
            type="button"
            aria-label="Close chats"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-white/15"
          >
            <X className="size-4" />
          </button>
        </div>
        {chats.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-white/90">
            Conversations in this tab show up here.
          </p>
        ) : (
          <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pb-1">
            {chats.map((chat) => {
              const href = `/c/${chat.id}`;
              return (
                <li key={chat.id}>
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-current={pathname === href ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-xl px-3 py-2 text-sm hover:bg-white/15",
                      pathname === href && "bg-white/20 font-medium",
                    )}
                  >
                    {chat.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
