"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  };

  if (!enabled) {
    return (
      <p className="rounded-lg border p-3 text-muted-foreground text-sm">
        Sign-in is not set up yet. Add the Supabase keys to{" "}
        <code>.env.local</code> (see README).
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="rounded-lg border bg-background px-3 py-2"
      />
      <Button
        type="submit"
        disabled={status === "sending"}
        className="bg-[#2f68c2] text-white [text-shadow:none] hover:bg-[#295ca9]"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
      {status === "sent" && (
        <p className="text-sm">Check your inbox for the link.</p>
      )}
      {status === "error" && (
        <p className="text-destructive text-sm">That didn't work. Try again.</p>
      )}
    </form>
  );
}
