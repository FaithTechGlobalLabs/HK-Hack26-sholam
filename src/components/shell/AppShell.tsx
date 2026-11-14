"use client";

import { Menu } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "./ModeToggle";
import { Sidebar } from "./Sidebar";

/**
 * ChatGPT-style frame: left sidebar (a drawer below md), a header with the
 * Chat | Flashcards toggle, and the routed view.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full transition-transform md:static md:translate-x-0",
          drawerOpen && "translate-x-0",
        )}
      >
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </div>
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
          <button
            type="button"
            aria-label="Open sidebar"
            className="justify-self-start rounded-md p-2 hover:bg-muted md:invisible"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <ModeToggle />
          <span />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
