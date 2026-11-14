import Link from "next/link";

/** A saved chat opened by anyone but its owner, or by a signed-out visitor. */
export default function ChatNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-medium text-2xl">This chat isn't available</h1>
      <p className="max-w-sm text-white/95">
        Chats are private to the account that had them. If it's yours, sign in
        to open it.
      </p>
      <div className="mt-2 flex gap-5">
        <Link
          href="/login"
          className="rounded-md underline decoration-white/60 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80"
        >
          Sign in
        </Link>
        <Link
          href="/"
          className="rounded-md underline decoration-white/60 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80"
        >
          New chat
        </Link>
      </div>
    </div>
  );
}
