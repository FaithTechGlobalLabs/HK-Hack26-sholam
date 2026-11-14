import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { CloudSky } from "@/components/shell/CloudSky";
import { BRAND_NAME } from "@/lib/brand";

/**
 * The sign-in screens sit on the same sky as the app, in one glass panel,
 * so signing in reads as part of Shalom rather than a separate site.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="sky-theme relative isolate flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10">
      <CloudSky />
      <main className="glass w-full max-w-sm rounded-3xl px-6 pt-6 pb-7">
        <LogoMark title={BRAND_NAME} className="mb-5 size-9 text-white" />
        {children}
      </main>
      <Link
        href="/"
        className="rounded-md text-sm text-white underline decoration-white/60 underline-offset-4 [text-shadow:0_1px_2px_rgb(18_48_110/0.6)] hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80"
      >
        Back to chat
      </Link>
    </div>
  );
}

/** Classes shared by the sign-in screens. */
export const authStyles = {
  title: "font-semibold text-[22px] leading-tight text-balance",
  lead: "mt-2 text-[15px] text-white/95 leading-relaxed",
  label: "mb-1.5 block font-medium text-sm",
  input:
    "h-11 w-full rounded-xl border border-white/45 bg-white/15 px-3.5 text-[16px] text-white outline-none transition-colors duration-150 [text-shadow:none] placeholder:text-white/75 focus-visible:border-white focus-visible:bg-white/22 aria-invalid:border-white",
  primary:
    "mt-4 flex h-11 w-full items-center justify-center rounded-full bg-white font-semibold text-[#1f4f9e] text-[15px] transition-colors duration-150 [text-shadow:none] hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/70",
  textButton:
    "rounded-md text-sm text-white underline decoration-white/55 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-75",
  problem:
    "mt-4 rounded-xl bg-[rgb(18_48_110/0.5)] px-3.5 py-2.5 text-sm text-white leading-snug",
} as const;
