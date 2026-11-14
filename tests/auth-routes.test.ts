import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp, exchangeCodeForSession, signOut },
  }),
}));
vi.mock("@/lib/account/server", () => ({
  afterSignInPath: async (_userId: string, next: string) => next,
}));

const { POST: verify } = await import("@/app/auth/verify/route");
const { GET: callback } = await import("@/app/auth/callback/route");
const { POST: signout } = await import("@/app/auth/signout/route");

const ORIGIN = "http://localhost:5314";

function confirmPost(
  fields: Record<string, string>,
  origin: string | null = ORIGIN,
) {
  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}/auth/verify`, {
    method: "POST",
    headers,
    body,
  });
}

function location(res: Response) {
  const url = new URL(res.headers.get("location") ?? "", ORIGIN);
  return `${url.pathname}${url.search}`;
}

beforeEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
  signOut.mockReset();
});

describe("POST /auth/verify (the link's Sign in button)", () => {
  it("signs in and continues to next", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await verify(
      confirmPost({ token_hash: "0123456789abc", type: "email", next: "/c/9" }),
    );
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/c/9");
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "0123456789abc",
      type: "email",
    });
  });

  it("explains a used or expired link", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null },
      error: {
        code: "otp_expired",
        status: 403,
        message: "Email link is invalid or has expired",
      },
    });
    const res = await verify(
      confirmPost({ token_hash: "0123456789abc", type: "email" }),
    );
    expect(location(res)).toBe("/login?error=link_invalid");
  });

  it("refuses a link with no token without calling Supabase", async () => {
    const res = await verify(confirmPost({ type: "email" }));
    expect(location(res)).toBe("/login?error=link_missing");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a post from another site (forced sign-in)", async () => {
    const res = await verify(
      confirmPost(
        { token_hash: "0123456789abc", type: "email" },
        "https://evil.example",
      ),
    );
    expect(location(res)).toBe("/login?error=unknown");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("drops an off-site next", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await verify(
      confirmPost({
        token_hash: "0123456789abc",
        type: "email",
        next: "https://evil.example",
      }),
    );
    expect(location(res)).toBe("/");
  });
});

describe("GET /auth/callback", () => {
  it("sends the emailed token_hash link to the confirm page, spending nothing", async () => {
    const res = await callback(
      new Request(
        `${ORIGIN}/auth/callback?token_hash=0123456789abc&type=email`,
      ),
    );
    expect(location(res)).toBe(
      "/auth/confirm?token_hash=0123456789abc&type=email",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("passes Supabase's error parameters on to /login", async () => {
    const res = await callback(
      new Request(
        `${ORIGIN}/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
      ),
    );
    expect(location(res)).toBe("/login?error=link_invalid");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("explains a PKCE link opened in a different browser", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { code: "flow_state_not_found", status: 404 },
    });
    const res = await callback(new Request(`${ORIGIN}/auth/callback?code=x`));
    expect(location(res)).toBe("/login?error=link_other_browser");
  });

  it("signs in with a good code", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    const res = await callback(
      new Request(`${ORIGIN}/auth/callback?code=x&next=/flashcards`),
    );
    expect(location(res)).toBe("/flashcards");
  });
});

describe("POST /auth/signout", () => {
  it("signs out on this device and goes home", async () => {
    const res = await signout(
      new Request(`${ORIGIN}/auth/signout`, {
        method: "POST",
        headers: { origin: ORIGIN },
      }),
    );
    expect(res.status).toBe(303);
    expect(location(res)).toBe("/");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("ignores a sign-out posted from another site", async () => {
    await signout(
      new Request(`${ORIGIN}/auth/signout`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});
