import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame, authStyles as s } from "@/components/auth/AuthFrame";
import { LoginForm } from "@/components/shell/LoginForm";
import { getAccount } from "@/lib/account/server";
import { accountLabel } from "@/lib/account/types";
import { safeNextPath } from "@/lib/auth/next-path";
import { isAuthProblem } from "@/lib/auth/problems";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Sign in · Shalom" };

/**
 * Sign in or sign up. `?next=` is where to go afterwards (same-site paths
 * only), `?error=` a problem from a failed link, and `?step=name` the
 * display-name step that a link sign-in for a new account lands on.
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthFrame>
      <Suspense fallback={<p className={s.lead}>Loading…</p>}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthFrame>
  );
}

async function LoginContent({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = params.error;
  const wantsName = params.step === "name";
  const account = await getAccount();

  if (account && !wantsName) {
    return (
      <>
        <h1 className={s.title}>You're signed in</h1>
        <p className={s.lead}>
          as <span className="font-semibold">{accountLabel(account)}</span>.
        </p>
        <Link href={next} className={s.primary}>
          Continue
        </Link>
        <form method="post" action="/auth/signout" className="mt-4 text-center">
          <button type="submit" className={s.textButton}>
            Sign out
          </button>
        </form>
      </>
    );
  }

  return (
    <LoginForm
      enabled={isSupabaseConfigured()}
      next={next}
      initialStep={account && wantsName ? "name" : "email"}
      initialProblem={isAuthProblem(error) ? error : null}
    />
  );
}
