"use client";

import {
  Layers,
  LogIn,
  PanelLeft,
  QrCode,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { accountLabel } from "@/lib/account/types";
import { useAccount } from "@/lib/account/use-account";
import { BRAND_NAME } from "@/lib/brand";
import { useChatList } from "@/lib/chat/use-chat-list";
import { cn } from "@/lib/utils";
import { AccountBadge, AccountMenu } from "./AccountMenu";
import { KeepTabChats } from "./KeepTabChats";
import { sectionOf, sectionTransition } from "./nav";
import { ShareApp } from "./ShareApp";

const STORE = "shalom.sidebar";

/**
 * The desktop sidebar, laid out like ChatGPT's: logo and collapse at the
 * top, New chat / Search chats / Flashcards, the chat list (the account's
 * saved chats when signed in, this tab's otherwise), and at the bottom
 * "Share Shalom" (link + QR code) and the account (Sign in, or the account
 * menu with Sign out). It collapses to an icon rail (remembered per browser). Phones
 * use the dock instead (ShellDock); CSS decides which one shows.
 *
 * The highlight on the current item is one shared <ViewTransition>, so it
 * glides from item to item when the route changes. Reading the pathname
 * suspends on /c/[chatId] under Cache Components; the fallback is the same
 * sidebar with nothing highlighted.
 */
export function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  // No width animation for the stored state on first paint.
  const [animate, setAnimate] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORE) === "collapsed");
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const setStored = useCallback((next: boolean) => {
    setCollapsed(next);
    localStorage.setItem(STORE, next ? "collapsed" : "open");
  }, []);

  const startSearch = useCallback(() => {
    setStored(false);
    setSearching(true);
  }, [setStored]);

  const body = (pathname: string | null) => (
    <SidebarBody
      pathname={pathname}
      collapsed={collapsed}
      onCollapse={() => setStored(!collapsed)}
      searching={searching}
      onSearch={startSearch}
      onEndSearch={() => setSearching(false)}
    />
  );

  return (
    <aside
      id="sidebar"
      aria-label="Sidebar"
      className={cn(
        "relative z-10 hidden h-full shrink-0 flex-col overflow-hidden border-white/20 border-r bg-[var(--sky-rail)] text-white backdrop-blur-xl backdrop-saturate-150 md:flex",
        collapsed ? "w-14" : "w-[260px]",
        animate &&
          "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
      )}
    >
      <Suspense fallback={body(null)}>
        <ActiveBody render={body} />
      </Suspense>
    </aside>
  );
}

function ActiveBody({
  render,
}: {
  render: (pathname: string | null) => ReactNode;
}) {
  return render(usePathname());
}

function SidebarBody({
  pathname,
  collapsed,
  onCollapse,
  searching,
  onSearch,
  onEndSearch,
}: {
  pathname: string | null;
  collapsed: boolean;
  onCollapse: () => void;
  searching: boolean;
  onSearch: () => void;
  onEndSearch: () => void;
}) {
  const section = sectionOf(pathname);
  return (
    <div className="flex h-full w-[260px] flex-col px-2 pb-2 [text-shadow:0_1px_2px_rgb(18_48_110/0.6)]">
      <div className="flex h-12 shrink-0 items-center justify-between">
        {collapsed ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Open sidebar"
            aria-expanded={false}
            aria-controls="sidebar"
            title="Open sidebar"
            className="group grid size-10 place-items-center rounded-xl hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80"
          >
            <LogoMark className="col-start-1 row-start-1 size-6 group-hover:opacity-0 group-focus-visible:opacity-0" />
            <PanelLeft className="col-start-1 row-start-1 size-5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        ) : (
          <>
            <Link
              href="/"
              transitionTypes={sectionTransition(pathname, "/")}
              aria-label={`${BRAND_NAME}, start a new chat`}
              className="rounded-xl px-2 py-1.5 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80"
            >
              <Logo />
            </Link>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Close sidebar"
              aria-expanded
              aria-controls="sidebar"
              title="Close sidebar"
              className="grid size-10 place-items-center rounded-xl text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white/80"
            >
              <PanelLeft className="size-5" />
            </button>
          </>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavItem
          href="/"
          from={pathname}
          collapsed={collapsed}
          active={pathname === "/"}
          icon={<SquarePen />}
          label="New chat"
        />
        <button
          type="button"
          onClick={onSearch}
          title="Search chats"
          className={cn(ITEM, width(collapsed))}
        >
          <Icon>
            <Search />
          </Icon>
          <span className="relative truncate">Search chats</span>
        </button>
        <NavItem
          href="/flashcards"
          from={pathname}
          collapsed={collapsed}
          active={section === "cards"}
          icon={<Layers />}
          label="Flashcards"
        />
      </nav>

      <ChatList
        pathname={pathname}
        hidden={collapsed}
        searching={searching}
        onEndSearch={onEndSearch}
      />

      <div
        className={cn(
          "mt-auto flex flex-col gap-0.5 border-white/20 border-t pt-2 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          width(collapsed),
        )}
      >
        <ShareApp triggerClassName={cn(ITEM, width(collapsed))}>
          <Icon>
            <QrCode />
          </Icon>
          <span className="relative truncate">Share {BRAND_NAME}</span>
        </ShareApp>
        <SidebarAccount pathname={pathname} collapsed={collapsed} />
      </div>
    </div>
  );
}

const ITEM =
  "group relative flex h-10 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-xl px-3 text-left text-[15px] text-white transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80 motion-reduce:transition-none";

/** In the rail every item is a 40px square, so nothing is cut at the edge. */
const width = (collapsed: boolean) => (collapsed ? "w-10" : "w-full");

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
      {children}
    </span>
  );
}

/** One highlight for the whole sidebar; it glides to the current item. */
function Highlight() {
  return (
    <ViewTransition name="sidebar-current" share="nav-glide" default="none">
      <span
        aria-hidden
        className="absolute inset-0 rounded-xl bg-white/22 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
      />
    </ViewTransition>
  );
}

function NavItem({
  href,
  from,
  collapsed,
  active,
  icon,
  label,
}: {
  href: string;
  from: string | null;
  collapsed: boolean;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      transitionTypes={sectionTransition(from, href)}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(ITEM, width(collapsed))}
    >
      {active && <Highlight />}
      <Icon>{icon}</Icon>
      <span className="relative truncate">{label}</span>
    </Link>
  );
}

function ChatList({
  pathname,
  hidden,
  searching,
  onEndSearch,
}: {
  pathname: string | null;
  hidden: boolean;
  searching: boolean;
  onEndSearch: () => void;
}) {
  const { account, chats, unsaved, keepTabChats } = useChatList();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) input.current?.focus();
    else setQuery("");
  }, [searching]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  }, [chats, query]);

  return (
    <section
      aria-label="Chats"
      inert={hidden}
      className={cn(
        "mt-5 flex min-h-0 flex-1 flex-col transition-opacity duration-200",
        hidden && "opacity-0",
      )}
    >
      {searching ? (
        <div className="relative mb-1 flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-white/80" />
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onEndSearch();
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-10 w-full rounded-xl border border-white/30 bg-white/12 pr-9 pl-9 text-[15px] text-white outline-none placeholder:text-white/75 focus-visible:border-white/70"
          />
          <button
            type="button"
            onClick={onEndSearch}
            aria-label="Close search"
            className="absolute right-1.5 grid size-7 place-items-center rounded-lg text-white/85 hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <h2 className="px-3 pb-1 font-medium text-[13px] text-white/85">
          Chats
        </h2>
      )}
      {unsaved.length > 0 && !query && (
        <KeepTabChats count={unsaved.length} onKeep={keepTabChats} />
      )}
      {shown.length === 0 ? (
        <p className="px-3 py-1 text-[13px] text-white/85 leading-snug">
          {query
            ? "No chat titles match."
            : account.status === "signed-in"
              ? "Your chats show up here."
              : "Chats in this tab show up here. Sign in to keep them."}
        </p>
      ) : (
        <ul className="-mr-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-2 pb-2">
          {shown.map((chat) => {
            const href = `/c/${chat.id}`;
            const active = pathname === href;
            return (
              <li key={chat.id}>
                <Link
                  href={href}
                  transitionTypes={sectionTransition(pathname, href)}
                  aria-current={active ? "page" : undefined}
                  className="relative block truncate rounded-xl px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-white/80"
                >
                  {active && <Highlight />}
                  <span className="relative">{chat.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The bottom row: nothing while the account loads (so a signed-in person
 * never sees "Sign in" flash), "Sign in" when signed out, else the
 * account's initial and name, which opens the account menu upward.
 */
function SidebarAccount({
  pathname,
  collapsed,
}: {
  pathname: string | null;
  collapsed: boolean;
}) {
  const state = useAccount();
  if (state.status === "loading") return <div aria-hidden className="h-10" />;
  if (state.status === "signed-out") {
    const href =
      pathname && pathname !== "/"
        ? `/login?next=${encodeURIComponent(pathname)}`
        : "/login";
    return (
      <NavItem
        href={href}
        from={pathname}
        collapsed={collapsed}
        active={false}
        icon={<LogIn />}
        label="Sign in"
      />
    );
  }
  const label = accountLabel(state.account);
  return (
    <AccountMenu
      account={state.account}
      side="top"
      align="start"
      popupWidth={collapsed ? "w-60" : "w-[var(--anchor-width)]"}
      triggerLabel={`Account: ${label}`}
      triggerClassName={cn(
        ITEM,
        width(collapsed),
        "gap-2 px-2 data-popup-open:bg-white/15",
      )}
      trigger={
        <>
          <AccountBadge account={state.account} />
          <span className="relative truncate">{label}</span>
        </>
      }
    />
  );
}
