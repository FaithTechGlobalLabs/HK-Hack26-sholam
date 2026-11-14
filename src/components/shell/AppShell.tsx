import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { CloudSky } from "./CloudSky";
import { ShellDock } from "./ShellDock";

/**
 * App frame: the logo top-left (as ChatGPT places its own; it starts a new
 * chat), the routed view, and a dock in place of the sidebar (Ricky, PR #2).
 * The sky comes from jeffs-uis (Jeff, PR #1).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sky-theme relative isolate flex h-dvh flex-col overflow-hidden text-foreground">
      <CloudSky />
      <header className="flex h-12 shrink-0 items-center px-2">
        <Link
          href="/"
          aria-label="sholam, start a new chat"
          className="rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80"
        >
          <Logo className="drop-shadow-[0_1px_1.5px_rgb(18_48_110/0.55)]" />
        </Link>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <footer className="relative h-24 shrink-0 pb-[env(safe-area-inset-bottom)]">
        <ShellDock />
      </footer>
    </div>
  );
}
