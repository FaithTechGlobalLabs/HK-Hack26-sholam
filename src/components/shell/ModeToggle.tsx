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
  const activeIndex = Math.max(
    0,
    MODES.findIndex((m) => m.match(pathname)),
  );
  return (
    <nav
      aria-label="Mode"
      className="glass glass-float relative grid grid-cols-2 rounded-full p-1 text-sm"
    >
      {/* Sliding highlight that springs between the two modes. */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white/30 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_4px_12px_rgb(35_75_150/0.2)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map((mode, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={mode.href}
            href={mode.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative z-10 rounded-full px-5 py-1 text-center font-medium text-white/65 transition-colors duration-300 hover:text-white",
              active && "text-white",
            )}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
  );
}
