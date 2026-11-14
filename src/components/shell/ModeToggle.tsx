"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";

type Mode = "chat" | "flashcards";

const MODES: { mode: Mode; href: string; label: string }[] = [
  { mode: "chat", href: "/", label: "Chat" },
  { mode: "flashcards", href: "/flashcards", label: "Flashcards" },
];

/**
 * The two top-level modes, in the spot where ChatGPT puts Chat | Work.
 * Reading the pathname suspends on routes with unknown params
 * (/c/[chatId]) under Cache Components, so the prerendered shell shows the
 * toggle with nothing selected until the client knows the route.
 */
export function ModeToggle() {
  return (
    <Suspense fallback={<ModeToggleView active={null} />}>
      <ActiveModeToggle />
    </Suspense>
  );
}

function ActiveModeToggle() {
  const pathname = usePathname();
  return (
    <ModeToggleView
      active={pathname.startsWith("/flashcards") ? "flashcards" : "chat"}
    />
  );
}

function ModeToggleView({ active }: { active: Mode | null }) {
  return (
    <nav aria-label="Mode" className="flex rounded-full bg-muted p-1 text-sm">
      {MODES.map(({ mode, href, label }) => (
        <Link
          key={mode}
          href={href}
          aria-current={active === mode ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1 text-muted-foreground transition-colors",
            active === mode && "bg-background text-foreground shadow-sm",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
