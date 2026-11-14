"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Account = { name: string } | null;

/** Pick a friendly display name from a Supabase user. */
function displayName(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name", "user_name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return user.email?.split("@")[0] ?? "Signed in";
}

/**
 * Top-right account control: a quiet "Sign in" link when signed out, and
 * the user's name with a "Sign out" link when signed in.
 */
export function AccountButton() {
  const [account, setAccount] = useState<Account>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setAccount(data.user ? { name: displayName(data.user) } : null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(session?.user ? { name: displayName(session.user) } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await createClient()?.auth.signOut();
    setAccount(null);
  };

  if (!account) {
    return (
      <Link
        href="/login"
        className="glass-ghost rounded-full px-3.5 py-1.5 font-medium text-sm text-white/90 hover:text-white"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="glass flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-sm">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-full bg-white/85 font-semibold text-[#2f68c2] text-xs uppercase"
        >
          {account.name.slice(0, 1)}
        </span>
        <span className="max-w-40 truncate font-medium">{account.name}</span>
      </span>
      <button
        type="button"
        onClick={signOut}
        className="glass-ghost rounded-full px-3 py-1.5 text-sm text-white/75 hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
