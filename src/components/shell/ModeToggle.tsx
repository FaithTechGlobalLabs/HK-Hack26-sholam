"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, ViewTransition } from "react";
import { cn } from "@/lib/utils";
import { type Section, sectionOf, sectionTransition } from "./nav";

/**
 * Chat | Flashcards at the top of the page, where ChatGPT puts Chat | Work
 * (desktop; phones use the dock). The white pill is a shared
 * <ViewTransition>, so it slides to the other side as the page switches.
 * "Chat" returns to the chat you left, not a blank one.
 */
export function ModeToggle({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Toggle pathname={null} className={className} />}>
      <ActiveToggle className={className} />
    </Suspense>
  );
}

function ActiveToggle({ className }: { className?: string }) {
  return <Toggle pathname={usePathname()} className={className} />;
}

function Toggle({
  pathname,
  className,
}: {
  pathname: string | null;
  className?: string;
}) {
  const current = sectionOf(pathname);
  const [chatHref, setChatHref] = useState("/");
  useEffect(() => {
    if (pathname && sectionOf(pathname) === "chat") setChatHref(pathname);
  }, [pathname]);

  const modes: { section: Section; href: string; label: string }[] = [
    { section: "chat", href: chatHref, label: "Chat" },
    { section: "cards", href: "/flashcards", label: "Flashcards" },
  ];

  return (
    <nav
      aria-label="Mode"
      className={cn(
        "items-center rounded-full border border-white/25 bg-[var(--sky-rail)] p-1 backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
    >
      {modes.map(({ section, href, label }) => {
        const active = current === section;
        return (
          <Link
            key={section}
            href={href}
            transitionTypes={sectionTransition(pathname, href)}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              if (active) e.preventDefault();
            }}
            className={cn(
              "relative rounded-full px-4 py-1.5 font-medium text-sm transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-white/80",
              active
                ? "text-[var(--sky-ink)]"
                : "text-white [text-shadow:0_1px_2px_rgb(18_48_110/0.6)] hover:bg-white/12",
            )}
          >
            {active && (
              <ViewTransition name="mode-pill" share="nav-glide" default="none">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(18_48_110/0.3)]"
                />
              </ViewTransition>
            )}
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
