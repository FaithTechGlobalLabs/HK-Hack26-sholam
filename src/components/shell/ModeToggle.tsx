"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODES = [
  {
    href: "/",
    label: "Chat",
    match: (path: string) => !path.startsWith("/flashcards"),
  },
  {
    href: "/flashcards",
    label: "Flashcards",
    match: (path: string) => path.startsWith("/flashcards"),
  },
];

/** The two top-level modes, in the spot where ChatGPT puts Chat | Work. */
export function ModeToggle() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mode" className="flex rounded-full bg-muted p-1 text-sm">
      {MODES.map((mode) => {
        const active = mode.match(pathname);
        return (
          <Link
            key={mode.href}
            href={mode.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1 text-muted-foreground transition-colors",
              active && "bg-background text-foreground shadow-sm",
            )}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
