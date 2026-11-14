"use client";

import { Layers, LogIn, Search, SquarePen } from "lucide-react";
import Link from "next/link";

/**
 * Phase 2: recent chats from the database, grouped Today / Yesterday /
 * Previous 7 days / Older, with a search dialog over chat titles.
 */
export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const item =
    "glass-ghost flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm";

  return (
    <aside className="glass flex h-full flex-col rounded-none md:rounded-2xl">
      <div className="px-3 pt-3 pb-2 font-semibold tracking-tight">sholam</div>

      <nav className="flex flex-col gap-0.5 px-2">
        <Link href="/" className={item} onClick={onNavigate}>
          <SquarePen className="size-4" /> New chat
        </Link>
        <button
          type="button"
          className={`${item} text-left opacity-60`}
          disabled
          title="Arrives with chat history"
        >
          <Search className="size-4" /> Search chats
        </button>
        <Link href="/flashcards" className={item} onClick={onNavigate}>
          <Layers className="size-4" /> Flashcards
        </Link>
      </nav>

      <section className="mt-4 min-h-0 flex-1 overflow-y-auto px-2">
        <h2 className="px-2 pb-1 text-muted-foreground text-xs">Chats</h2>
        <p className="px-2 text-muted-foreground text-xs">
          Your chats will be listed here once you sign in.
        </p>
      </section>

      <div className="border-white/25 border-t p-2">
        <Link href="/login" className={item} onClick={onNavigate}>
          <LogIn className="size-4" /> Sign in
        </Link>
      </div>
    </aside>
  );
}
