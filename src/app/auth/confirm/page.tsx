import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame, authStyles as s } from "@/components/auth/AuthFrame";
import { SIGN_IN_EMAIL_HAS_CODE } from "@/lib/auth/email";
import { parseSignInLink } from "@/lib/auth/link";

export const metadata: Metadata = {
  title: "Finish signing in · Shalom",
  robots: { index: false },
};

/**
 * Where the emailed link lands. Opening the page spends nothing: the token
 * is used only when the person presses "Sign in" (a POST to /auth/verify).
 * Email scanners that open every link therefore can't use it up, which is
 * what made links "already used" before.
 */
export default function ConfirmPage({
  searchParams,
}: PageProps<"/auth/confirm">) {
  return (
    <AuthFrame>
      <Suspense fallback={<p className={s.lead}>Loading…</p>}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </AuthFrame>
  );
}

async function Confirm({
  searchParams,
}: Pick<PageProps<"/auth/confirm">, "searchParams">) {
  const link = parseSignInLink(await searchParams);
  if (!link) {
    return (
      <>
        <h1 className={s.title}>This link is incomplete</h1>
        <p className={s.lead}>
          {SIGN_IN_EMAIL_HAS_CODE
            ? "Enter the code from the same email instead, or ask for a new one."
            : "Ask for a new one on the sign-in page."}
        </p>
        <Link href="/login?error=link_missing" className={s.primary}>
          Go to sign in
        </Link>
      </>
    );
  }
  return (
    <form method="post" action="/auth/verify">
      <h1 className={s.title}>Finish signing in</h1>
      <p className={s.lead}>Sign in to Shalom on this device.</p>
      <input type="hidden" name="token_hash" value={link.tokenHash} />
      <input type="hidden" name="type" value={link.type} />
      <input type="hidden" name="next" value={link.next} />
      <button type="submit" className={s.primary}>
        Sign in
      </button>
    </form>
  );
}
