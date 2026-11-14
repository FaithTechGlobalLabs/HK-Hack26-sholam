"use client";

import { Layers, LogIn, SquarePen } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import Dock, { type DockItemData } from "@/components/ui/dock";
import { ModeToggle } from "./ModeToggle";

/**
 * App frame: a header with the Chat | Flashcards toggle, the routed view,
 * and a dock in place of the sidebar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const items = useMemo<DockItemData[]>(
    () => [
      {
        icon: <SquarePen />,
        label: "New chat",
        active: pathname === "/" || pathname.startsWith("/c/"),
        onClick: () => router.push("/"),
      },
      {
        icon: <Layers />,
        label: "Flashcards",
        active: pathname.startsWith("/flashcards"),
        onClick: () => router.push("/flashcards"),
      },
      { separator: true },
      {
        icon: <LogIn />,
        label: "Sign in",
        onClick: () => router.push("/login"),
      },
    ],
    [pathname, router],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3">
        <span className="justify-self-start font-semibold tracking-tight">
          sholam
        </span>
        <ModeToggle />
        <span />
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <footer className="relative h-24 shrink-0">
        <Dock theme="light" items={items} />
      </footer>
    </div>
  );
}
