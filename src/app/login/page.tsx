import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { LoginForm } from "@/components/shell/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <main className="mx-auto flex h-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <LogoMark className="mb-4 size-10 text-[#2f68c2]" />
        <h1 className="font-semibold text-xl">Sign in to sholam</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Signing in keeps your chats. Flashcards are public and need no account
          to read.
        </p>
      </div>
      <LoginForm enabled={isSupabaseConfigured()} />
      <Link
        href="/"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        Back to chat
      </Link>
    </main>
  );
}
