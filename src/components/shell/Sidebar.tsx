"use client";

import { Layers, LogIn, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type LocalChat, listLocalChats } from "@/lib/chat/local-history";
import { cn } from "@/lib/utils";

/**
 * Recent chats from sessionStorage until Postgres history lands.
 */
export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const [chats, setChats] = useState<LocalChat[]>([]);

  useEffect(() => {
    const refresh = () => setChats(listLocalChats());
    refresh();
    window.addEventListener("shalom:chats", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("shalom:chats", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Refresh the list when the route changes (new chat URL after first send).
  useEffect(() => {
    void pathname;
    setChats(listLocalChats());
  }, [pathname]);

  const item =
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent";

  return (
    <aside className="flex h-full flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-3 pt-3 pb-2 font-semibold tracking-tight">Shalom</div>

      <nav className="flex flex-col gap-0.5 px-2">
        <Link href="/" className={item} onClick={onNavigate}>
          <SquarePen className="size-4" /> New chat
        </Link>
        <Link href="/flashcards" className={item} onClick={onNavigate}>
          <Layers className="size-4" /> Flashcards
        </Link>
      </nav>

      <section className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <h2 className="px-2 pb-1 text-muted-foreground text-xs">Chats</h2>
        {chats.length === 0 ? (
          <p className="px-2 text-muted-foreground text-xs">
            Conversations in this tab show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => {
              const href = `/c/${chat.id}`;
              const active = pathname === href;
              return (
                <li key={chat.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      item,
                      "truncate",
                      active && "bg-sidebar-accent",
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

      <div className="border-t p-2">
        <Link href="/login" className={item} onClick={onNavigate}>
          <LogIn className="size-4" /> Sign in
        </Link>
      </div>
    </aside>
  );
}
