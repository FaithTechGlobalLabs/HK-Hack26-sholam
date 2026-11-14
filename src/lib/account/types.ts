import { z } from "zod";

/** What the browser is told about the signed-in person. */
export interface Account {
  email: string | null;
  displayName: string | null;
}

/** `GET /api/account` */
export interface AccountResponse {
  /** Supabase Auth is configured, so signing in is possible. */
  enabled: boolean;
  account: Account | null;
  /** A database is configured, so names (and chats) can be saved. */
  canSave: boolean;
}

export const DISPLAY_NAME_MAX = 40;

/** Trims, collapses spaces, drops control characters; 1–40 characters. */
export const displayNameSchema = z
  .string()
  .transform((s) =>
    Array.from(s)
      .filter((ch) => {
        const code = ch.codePointAt(0) ?? 0;
        return code >= 0x20 && code !== 0x7f;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .pipe(z.string().min(1).max(DISPLAY_NAME_MAX));

/** The name to show: display name, else the email, else a neutral label. */
export function accountLabel(account: Account): string {
  return account.displayName ?? account.email ?? "Your account";
}

/** One letter for the account badge. */
export function accountInitial(account: Account): string {
  const first = Array.from(accountLabel(account).trim())[0] ?? "?";
  return first.toLocaleUpperCase();
}
