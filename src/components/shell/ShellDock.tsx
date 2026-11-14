"use client";

import { Layers, LogIn, MessagesSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Dock, { type DockItemData } from "@/components/ui/dock";
import { BibleChatIcon } from "./BrandIcon";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { sectionTransition } from "./nav";

/**
 * The bottom dock (Ricky's navigation in Jeff's sky design), on phones
 * only; desktop has the sidebar and the top toggle (AppShell). Reading the pathname suspends on
 * routes with unknown params (/c/[chatId]) under Cache Components, so the
 * prerendered shell shows the dock with nothing highlighted until the
 * client knows the route. Without the Suspense boundary `next build` fails.
 */
export function ShellDock() {
  return (
    <Suspense fallback={<NavDock pathname={null} />}>
      <ActiveDock />
    </Suspense>
  );
}

function ActiveDock() {
  return <NavDock pathname={usePathname()} />;
}

/**
 * The current page's item gets Jeff's lit glass tile and glowing underline
 * (`[data-active]` and `.dock-underline` in app/sky.css). The
 * view-transition name makes that highlight glide to the new item when the
 * page switches (same "nav-glide" timing as the sidebar, app/sky.css).
 */
const ACTIVE =
  "[view-transition-name:dock-current] [view-transition-class:nav-glide]";

function NavDock({ pathname }: { pathname: string | null }) {
  const router = useRouter();
  const [chatsOpen, setChatsOpen] = useState(false);
  const closeChats = useCallback(() => setChatsOpen(false), []);
  // The dock navigates with router.push, so prefetch what <Link> would have.
  useEffect(() => {
    router.prefetch("/");
    router.prefetch("/flashcards");
  }, [router]);
  const onChat =
    pathname !== null && (pathname === "/" || pathname.startsWith("/c/"));
  const onCards = pathname?.startsWith("/flashcards") ?? false;
  const items = useMemo<DockItemData[]>(
    () => [
      {
        icon: <BibleChatIcon />,
        label: "Chat",
        active: onChat,
        className: onChat ? ACTIVE : undefined,
        onClick: () =>
          router.push("/", {
            transitionTypes: sectionTransition(pathname, "/"),
          }),
      },
      {
        icon: <Layers />,
        label: "Flashcards",
        active: onCards,
        className: onCards ? ACTIVE : undefined,
        onClick: () =>
          router.push("/flashcards", {
            transitionTypes: sectionTransition(pathname, "/flashcards"),
          }),
      },
      {
        icon: <MessagesSquare />,
        label: "Chats",
        // Open, not a page: the lit tile without the underline (sky.css).
        className: chatsOpen ? "dock-open" : undefined,
        onClick: () => setChatsOpen((open) => !open),
      },
      { separator: true },
      {
        icon: <LogIn />,
        label: "Sign in",
        onClick: () => router.push("/login"),
      },
    ],
    [pathname, onChat, onCards, chatsOpen, router],
  );
  return (
    <>
      {chatsOpen && (
        <ChatHistoryPanel pathname={pathname} onClose={closeChats} />
      )}
      <Dock theme="sky" items={items} bounce={false} />
    </>
  );
}
