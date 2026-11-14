"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Account, AccountResponse } from "./types";

/**
 * Who is signed in, for client components (sidebar, header, chat list).
 * One `/api/account` request per page load, shared by every caller. The
 * server render and the first client render both see "loading", so
 * hydration matches; nothing reads cookies during the static prerender.
 * Signing in and out are full page loads, which start this over.
 */

export type AccountState =
  | { status: "loading" }
  | { status: "signed-out"; enabled: boolean }
  | { status: "signed-in"; account: Account; canSave: boolean };

const LOADING: AccountState = { status: "loading" };

let state: AccountState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function publish(next: AccountState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshAccount(): Promise<AccountState> {
  try {
    const res = await fetch("/api/account", { cache: "no-store" });
    if (!res.ok) throw new Error(`account ${res.status}`);
    const body = (await res.json()) as AccountResponse;
    publish(
      body.account
        ? { status: "signed-in", account: body.account, canSave: body.canSave }
        : { status: "signed-out", enabled: body.enabled },
    );
  } catch {
    // Unreachable API: offer "Sign in" rather than an empty slot.
    if (state.status === "loading")
      publish({ status: "signed-out", enabled: true });
  }
  return state;
}

/** After a change made here (a new display name), without another request. */
export function setSignedInAccount(account: Account, canSave: boolean) {
  publish({ status: "signed-in", account, canSave });
}

export function useAccount(): AccountState {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void refreshAccount();
  }, []);
  return snapshot;
}
