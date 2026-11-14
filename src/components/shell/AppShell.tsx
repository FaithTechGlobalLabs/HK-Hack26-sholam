import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { BRAND_NAME } from "@/lib/brand";
import { CloudSky } from "./CloudSky";
import { DesktopSidebar } from "./DesktopSidebar";
import { ModeToggle } from "./ModeToggle";
import { ShellDock } from "./ShellDock";

/**
 * App frame. Desktop keeps ChatGPT's layout: a sidebar on the left and the
 * Chat | Flashcards toggle at the top centre. Phones get the logo top-left
 * and Ricky's dock at the bottom (PR #2). The sky comes from jeffs-uis
 * (Jeff, PR #1). The breakpoint is `md` (768px), in CSS only, so the server
 * render needs no screen size.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sky-theme relative isolate flex h-dvh overflow-hidden text-foreground">
      <CloudSky />
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center px-2 md:justify-center">
          <Link
            href="/"
            aria-label={`${BRAND_NAME}, start a new chat`}
            className="rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80 md:hidden"
          >
            <Logo className="drop-shadow-[0_1px_1.5px_rgb(18_48_110/0.55)]" />
          </Link>
          <ModeToggle className="hidden md:flex" />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
        <footer className="relative h-24 shrink-0 pb-[env(safe-area-inset-bottom)] md:hidden">
          <ShellDock />
        </footer>
      </div>
    </div>
  );
}
