"use client";

import { Layers, Mailbox } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import Dock, { type DockItemData } from "@/components/ui/dock";
import { recordVisitDay } from "@/lib/usage-stats";
import { AccountButton } from "./AccountButton";
import { BibleChatIcon } from "./BrandIcon";
import { CloudSky } from "./CloudSky";
import { SplashScreen } from "./SplashScreen";

/**
 * App frame: the wordmark, the routed view, and a dock in place of the
 * sidebar. The sky comes from jeffs-uis.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    recordVisitDay();
  }, []);

  const items = useMemo<DockItemData[]>(
    () => [
      {
        icon: <BibleChatIcon />,
        label: "Chat",
        active: pathname === "/" || pathname.startsWith("/c/"),
        onClick: () => router.push("/"),
      },
      {
        icon: <Layers />,
        label: "Flashcards",
        active: pathname.startsWith("/flashcards"),
        onClick: () => router.push("/flashcards"),
      },
      {
        icon: <Mailbox />,
        label: "Letters",
        active: pathname.startsWith("/letters"),
        onClick: () => router.push("/letters"),
      },
    ],
    [pathname, router],
  );

  return (
    <div className="sky-theme relative isolate flex h-dvh flex-col overflow-hidden text-foreground">
      <CloudSky />
      <SplashScreen />
      <header className="flex h-12 shrink-0 items-center justify-between px-3">
        <span className="font-semibold tracking-tight">sholam</span>
        <AccountButton />
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      <footer className="relative h-24 shrink-0">
        <Dock theme="sky" items={items} bounce={false} />
      </footer>
    </div>
  );
}
