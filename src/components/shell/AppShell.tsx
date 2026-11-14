"use client";

import { Layers, LogIn, SquarePen } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import Dock, { type DockItemData } from "@/components/ui/dock";
import { CloudSky } from "./CloudSky";

/**
 * App frame: the wordmark, the routed view, and a dock in place of the
 * sidebar. The sky comes from jeffs-uis.
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
    <div className="sky-theme relative isolate flex h-dvh flex-col overflow-hidden text-foreground">
      <CloudSky />
      <header className="flex h-12 shrink-0 items-center px-3">
        <span className="font-semibold tracking-tight">sholam</span>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <footer className="relative h-24 shrink-0">
        <Dock theme="light" items={items} />
      </footer>
    </div>
  );
}
