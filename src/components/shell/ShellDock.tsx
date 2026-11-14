"use client";

import { Layers, LogIn, MessagesSquare, SquarePen } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Dock, { type DockItemData } from "@/components/ui/dock";
import { ChatHistoryPanel } from "./ChatHistoryPanel";

/**
 * The bottom dock (Ricky's navigation). Reading the pathname suspends on
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

/** The current page's tile in the deep sky blue, instead of a small dot. */
const ACTIVE = "[--dock-tile:#2f68c2] [--dock-ink:#fff]";

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
        icon: <SquarePen />,
        label: "New chat",
        active: onChat,
        className: onChat ? ACTIVE : undefined,
        onClick: () => router.push("/"),
      },
      {
        icon: <Layers />,
        label: "Flashcards",
        active: onCards,
        className: onCards ? ACTIVE : undefined,
        onClick: () => router.push("/flashcards"),
      },
      {
        icon: <MessagesSquare />,
        label: "Chats",
        active: chatsOpen,
        onClick: () => setChatsOpen((open) => !open),
      },
      { separator: true },
      {
        icon: <LogIn />,
        label: "Sign in",
        onClick: () => router.push("/login"),
      },
    ],
    [onChat, onCards, chatsOpen, router],
  );
  return (
    <>
      {chatsOpen && (
        <ChatHistoryPanel pathname={pathname} onClose={closeChats} />
      )}
      <Dock theme="light" items={items} showIndicators={false} />
    </>
  );
}
