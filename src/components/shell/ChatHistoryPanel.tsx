"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useChatList } from "@/lib/chat/use-chat-list";
import { cn } from "@/lib/utils";
import { KeepTabChats } from "./KeepTabChats";

/**
 * Recent chats in a panel opened from the dock's Chats item on phones;
 * desktop lists them in the sidebar. Signed in: the account's saved chats
 * (plus this tab's unsaved ones); signed out: this tab's history
 * (MustyDusty's sessionStorage list). Both come from useChatList.
 */
export function ChatHistoryPanel({
  pathname,
  onClose,
}: {
  pathname: string | null;
  onClose: () => void;
}) {
  const { account, chats, unsaved, keepTabChats } = useChatList();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Near-opaque, like the account menu: inside the footer the panel can't
  // blur the page behind it, so a see-through glass let the suggestion
  // chips show through the chat titles.
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
        className="fixed bottom-28 left-1/2 z-50 flex max-h-[60dvh] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col rounded-3xl border border-white/20 bg-[rgb(24_58_128/0.92)] p-2 text-white shadow-[0_6px_16px_rgb(18_48_110/0.28)] backdrop-blur-xl"
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
        {unsaved.length > 0 && (
          <div className="px-1">
            <KeepTabChats count={unsaved.length} onKeep={keepTabChats} />
          </div>
        )}
        {chats.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-white/90">
            {account.status === "signed-in"
              ? "Your chats show up here."
              : "Chats in this tab show up here. Sign in to keep them."}
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
