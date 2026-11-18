"use client";

import { Menu } from "@base-ui/react/menu";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { type Account, accountInitial } from "@/lib/account/types";
import { clearLocalChats } from "@/lib/chat/local-history";
import { PRIVACY_PATH, SUPPORT_PATH } from "@/lib/site-info";
import { cn } from "@/lib/utils";

/**
 * The signed-in account's menu: who you are, and Sign out. The desktop
 * sidebar opens it upward from its bottom row (where ChatGPT keeps its
 * account control); phones open it down from the header chip.
 *
 * Sign out posts a real form to /auth/signout (a same-origin POST, so a
 * link elsewhere can't sign anyone out) and first forgets this tab's chat
 * history, so the next person on a shared device can't read it.
 */
export function AccountMenu({
  account,
  trigger,
  triggerClassName,
  triggerLabel,
  side,
  align,
  popupWidth = "w-64",
}: {
  account: Account;
  trigger: ReactNode;
  triggerClassName: string;
  triggerLabel: string;
  side: "top" | "bottom";
  align: "start" | "end";
  /** Tailwind width for the popup (the sidebar matches its row). */
  popupWidth?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const signOut = () => {
    clearLocalChats();
    form.current?.requestSubmit();
  };

  return (
    <>
      <Menu.Root>
        <Menu.Trigger aria-label={triggerLabel} className={triggerClassName}>
          {trigger}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side={side}
            align={align}
            sideOffset={8}
            className="z-50 outline-none"
          >
            <Menu.Popup
              className={cn(
                popupWidth,
                "origin-[var(--transform-origin)] rounded-2xl border border-white/20 bg-[rgb(24_58_128/0.9)] p-1.5 text-white shadow-[0_6px_16px_rgb(18_48_110/0.28)] outline-none backdrop-blur-xl",
                "transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-[0.97] data-starting-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
              )}
            >
              <div className="px-3 pt-2 pb-2.5">
                {account.displayName && (
                  <p className="truncate font-medium text-[15px]">
                    {account.displayName}
                  </p>
                )}
                {account.email && (
                  <p className="truncate text-[13px] text-white/80">
                    {account.email}
                  </p>
                )}
              </div>
              <Menu.Item
                render={<Link href={SUPPORT_PATH} prefetch={false} />}
                className="flex min-h-11 items-center rounded-xl px-3 text-[15px] outline-none data-highlighted:bg-white/15"
              >
                Support
              </Menu.Item>
              <Menu.Item
                render={<Link href={PRIVACY_PATH} prefetch={false} />}
                className="flex min-h-11 items-center rounded-xl px-3 text-[15px] outline-none data-highlighted:bg-white/15"
              >
                Privacy policy
              </Menu.Item>
              <Menu.Item
                onClick={signOut}
                className="flex h-10 cursor-default select-none items-center gap-3 rounded-xl px-3 text-[15px] outline-none data-highlighted:bg-white/15"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <form ref={form} method="post" action="/auth/signout" hidden />
    </>
  );
}

/** The account's initial on a white disc, in the sky blue (Jeff's AccountButton). */
export function AccountBadge({ account }: { account: Account }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full bg-white/90 font-semibold text-[13px] text-[#2f68c2] leading-none [text-shadow:none]"
    >
      {accountInitial(account)}
    </span>
  );
}
