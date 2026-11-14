"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { accountLabel } from "@/lib/account/types";
import { useAccount } from "@/lib/account/use-account";
import { cn } from "@/lib/utils";
import { AccountBadge, AccountMenu } from "./AccountMenu";

/**
 * Top-right account control on phones, after Jeff's design (jeffs-uis
 * 30df585): a "Sign in" pill when signed out; the account's initial and
 * name on a glass chip when signed in, which opens the account menu.
 * Desktop shows the account at the bottom of the sidebar instead.
 */
export function AccountButton({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Control pathname={null} className={className} />}>
      <ActiveControl className={className} />
    </Suspense>
  );
}

function ActiveControl({ className }: { className?: string }) {
  return <Control pathname={usePathname()} className={className} />;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-white/80 focus-visible:outline-offset-2";

function Control({
  pathname,
  className,
}: {
  pathname: string | null;
  className?: string;
}) {
  const state = useAccount();

  if (state.status === "loading")
    return <span aria-hidden className={cn("h-10 w-24", className)} />;

  if (state.status === "signed-out") {
    const next =
      pathname && pathname !== "/"
        ? `?next=${encodeURIComponent(pathname)}`
        : "";
    return (
      <Link
        href={`/login${next}`}
        className={cn(
          "glass-btn inline-flex h-10 items-center rounded-full px-4 font-medium text-sm [text-shadow:0_1px_2px_rgb(18_48_110/0.55)]",
          FOCUS,
          className,
        )}
      >
        Sign in
      </Link>
    );
  }

  const label = accountLabel(state.account);
  return (
    <span className={className}>
      <AccountMenu
        account={state.account}
        side="bottom"
        align="end"
        triggerLabel={`Account: ${label}`}
        triggerClassName={cn(
          "glass flex h-10 items-center gap-2 rounded-full pr-4 pl-2 text-sm data-popup-open:bg-white/25",
          FOCUS,
        )}
        trigger={
          <>
            <AccountBadge account={state.account} />
            <span className="max-w-32 truncate font-medium [text-shadow:0_1px_2px_rgb(18_48_110/0.55)]">
              {label}
            </span>
          </>
        }
      />
    </span>
  );
}
