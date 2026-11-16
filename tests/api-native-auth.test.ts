import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnInput } from "@/lib/agent/harness";

/**
 * Route handlers with the real request-auth module; only the Supabase
 * clients, database and model harness are faked. No network, no secrets.
 */
const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  cookieClaims: vi.fn(),
  cookieClientCalls: 0,
  dbConfigured: true,
  live: true,
  inputs: [] as TurnInput[],
  listChats: vi.fn(),
  loadChat: vi.fn(),
  importTabChats: vi.fn(),
  appendTurn: vi.fn(),
  profileWrites: [] as unknown[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: h.getClaims } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    h.cookieClientCalls++;
    return { auth: { getClaims: h.cookieClaims } };
  },
}));
vi.mock("@/db", () => ({
  isDatabaseConfigured: () => h.dbConfigured,
  getDb: () => ({
    select: () => {
      throw new Error("no profile reads in tests");
    },
    insert: () => ({
      values: (v: unknown) => {
        h.profileWrites.push(v);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  }),
}));
vi.mock("@/lib/chat/store", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/chat/store")>();
  return {
    ...real,
    listChats: h.listChats,
    loadChat: h.loadChat,
    importTabChats: h.importTabChats,
    appendTurn: h.appendTurn,
  };
});
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/agent/harness", () => ({
  shouldUseLiveAgent: () => ({ live: h.live }),
  runAgentTurn: async function* (input: TurnInput) {
    h.inputs.push(input);
    yield { type: "text_delta" as const, text: "ok" };
    await input.onFinish?.({
      text: "ok",
      model: "m",
      stopReason: "stop",
      messages: [],
      verses: [],
      citations: { unverified: [], quoteWarnings: [] },
    });
    yield { type: "done" as const, stopReason: "stop" };
  },
}));
vi.mock("@/lib/agent/usage-store", async () => {
  const { createMemoryCounterStore } = await import("@/lib/agent/usage-limit");
  return { usageStore: () => createMemoryCounterStore() };
});
vi.mock("@/lib/agent/usage-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent/usage-limit")>();
  return { ...real, admitTurn: async () => ({ ok: true }) };
});
vi.mock("@/lib/flashcards/repo", () => ({
  listFlashcards: vi.fn(async () => []),
}));

const { resetBearerVerifierForTests } = await import(
  "@/lib/supabase/request-auth"
);
const account = await import("@/app/api/account/route");
const chats = await import("@/app/api/chats/route");
const chatById = await import("@/app/api/chats/[chatId]/route");
const importRoute = await import("@/app/api/chats/import/route");
const chat = await import("@/app/api/chat/route");

const ORIGIN = "http://localhost:5310";
const URL_ = "https://proj.supabase.co";
const USER = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";
const CHAT = "0b9e6c3a-1d2f-4a5b-8c7d-9e0f1a2b3c4d";
const COOKIE = { cookie: "sb-proj-auth-token=valid" };

function goodClaims() {
  return {
    iss: `${URL_}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    sub: USER,
    email: "native@example.com",
    exp: Math.floor(Date.now() / 1000) + 600,
  };
}
// A well-shaped legacy HS256 access token (fake signature): verified
// through the mocked getClaims, so no JWKS fetch is involved.
const seg = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
const TOKEN = `${seg({ alg: "HS256", typ: "JWT" })}.${seg(goodClaims())}.${"A".repeat(43)}`;
const BEARER = { authorization: `Bearer ${TOKEN}` };

function rq(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const chatParams = (chatId: string) =>
  ({ params: Promise.resolve({ chatId }) }) as never;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SHOLAM_ALLOW_LEGACY_JWT", "true");
  resetBearerVerifierForTests();
  h.getClaims.mockReset();
  h.cookieClaims.mockReset();
  h.cookieClientCalls = 0;
  h.dbConfigured = true;
  h.live = true;
  h.inputs.length = 0;
  h.profileWrites.length = 0;
  for (const fn of [h.listChats, h.loadChat, h.importTabChats, h.appendTurn])
    fn.mockReset();
  h.getClaims.mockResolvedValue({
    data: { claims: goodClaims() },
    error: null,
  });
  h.cookieClaims.mockResolvedValue({
    data: { claims: { sub: "cookie-user", email: "c@example.com" } },
    error: null,
  });
  h.listChats.mockResolvedValue([{ id: CHAT, title: "t" }]);
  h.loadChat.mockResolvedValue({
    status: "owned",
    chat: { id: CHAT },
    messages: [],
  });
  h.importTabChats.mockResolvedValue({ imported: 1, skipped: 0 });
  h.appendTurn.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

const rejectInvalid = () =>
  h.getClaims.mockResolvedValue({ data: null, error: new Error("bad jwt") });

describe("valid Bearer -> account-owned reads and writes", () => {
  it("GET /api/account returns the token's account", async () => {
    const res = await account.GET(rq("/api/account", { headers: BEARER }));
    expect(res.status).toBe(200);
    expect((await res.json()).account).toEqual({
      email: "native@example.com",
      displayName: null,
    });
    expect(h.cookieClientCalls).toBe(0);
  });

  it("GET /api/chats and /api/chats/[id] query by the verified user id", async () => {
    const list = await chats.GET(rq("/api/chats", { headers: BEARER }));
    expect(list.status).toBe(200);
    expect(h.listChats).toHaveBeenCalledWith(expect.anything(), USER);
    const one = await chatById.GET(
      rq(`/api/chats/${CHAT}`, { headers: BEARER }),
      chatParams(CHAT),
    );
    expect(one.status).toBe(200);
    expect(h.loadChat).toHaveBeenCalledWith(expect.anything(), USER, CHAT);
  });

  it("PATCH /api/account without Origin saves under the verified id", async () => {
    const res = await account.PATCH(
      rq("/api/account", {
        method: "PATCH",
        headers: BEARER,
        body: { displayName: "Mia" },
      }),
    );
    expect(res.status).toBe(200);
    expect(h.profileWrites).toEqual([{ id: USER, displayName: "Mia" }]);
  });

  it("POST /api/chats/import without Origin imports into the verified account", async () => {
    const res = await importRoute.POST(
      rq("/api/chats/import", {
        method: "POST",
        headers: BEARER,
        body: { chats: [] },
      }),
    );
    expect(res.status).toBe(200);
    expect(h.importTabChats).toHaveBeenCalledWith(expect.anything(), USER, []);
  });

  it("POST /api/chat passes the verified id to the turn and saves it", async () => {
    const res = await chat.POST(
      rq("/api/chat", {
        method: "POST",
        headers: BEARER,
        body: { message: "hi", chatId: CHAT },
      }),
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(h.inputs[0].userId).toBe(USER);
    expect(h.appendTurn).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      CHAT,
      expect.any(Array),
    );
  });
});

describe("invalid Bearer is rejected, never downgraded to cookie or guest", () => {
  const withCookie = { ...BEARER, ...COOKIE, origin: ORIGIN };

  it("account GET/PATCH answer 401 with no cookie lookup", async () => {
    rejectInvalid();
    const get = await account.GET(rq("/api/account", { headers: withCookie }));
    expect(get.status).toBe(401);
    expect(get.headers.get("www-authenticate")).toMatch(/invalid_token/);
    const patch = await account.PATCH(
      rq("/api/account", {
        method: "PATCH",
        headers: withCookie,
        body: { displayName: "x" },
      }),
    );
    expect(patch.status).toBe(401);
    expect(h.cookieClientCalls).toBe(0);
    expect(h.profileWrites).toHaveLength(0);
  });

  it("chat list, chat read and import answer 401", async () => {
    rejectInvalid();
    expect(
      (await chats.GET(rq("/api/chats", { headers: withCookie }))).status,
    ).toBe(401);
    expect(
      (
        await chatById.GET(
          rq(`/api/chats/${CHAT}`, { headers: withCookie }),
          chatParams(CHAT),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await importRoute.POST(
          rq("/api/chats/import", {
            method: "POST",
            headers: withCookie,
            body: { chats: [] },
          }),
        )
      ).status,
    ).toBe(401);
    expect(h.listChats).not.toHaveBeenCalled();
    expect(h.loadChat).not.toHaveBeenCalled();
    expect(h.importTabChats).not.toHaveBeenCalled();
    expect(h.cookieClientCalls).toBe(0);
  });

  it("/api/chat answers 401 in live and demo mode and never runs the model", async () => {
    rejectInvalid();
    for (const live of [true, false]) {
      h.live = live;
      const res = await chat.POST(
        rq("/api/chat", {
          method: "POST",
          headers: withCookie,
          body: { message: "hi" },
        }),
      );
      expect(res.status).toBe(401);
    }
    expect(h.inputs).toHaveLength(0);
  });

  it("a malformed Authorization header is a 401 too", async () => {
    const res = await chat.POST(
      rq("/api/chat", {
        method: "POST",
        headers: { authorization: "Token abc", ...COOKIE },
        body: { message: "hi" },
      }),
    );
    expect(res.status).toBe(401);
    expect(h.getClaims).not.toHaveBeenCalled();
    expect(h.inputs).toHaveLength(0);
  });

  it("a wrong-project token is rejected after verification", async () => {
    h.getClaims.mockResolvedValue({
      data: {
        claims: { ...goodClaims(), iss: "https://x.supabase.co/auth/v1" },
      },
      error: null,
    });
    expect(
      (await account.GET(rq("/api/account", { headers: BEARER }))).status,
    ).toBe(401);
  });
});

describe("no Authorization header: cookie and guest behaviour unchanged", () => {
  it("cookie session reads its own account and chats", async () => {
    const res = await account.GET(rq("/api/account", { headers: COOKIE }));
    expect((await res.json()).account.email).toBe("c@example.com");
    await chats.GET(rq("/api/chats", { headers: COOKIE }));
    expect(h.listChats).toHaveBeenCalledWith(expect.anything(), "cookie-user");
  });

  it("guests get the same answers as before", async () => {
    h.cookieClaims.mockResolvedValue({ data: null, error: null });
    const acct = await (await account.GET(rq("/api/account"))).json();
    expect(acct.account).toBeNull();
    const list = await chats.GET(rq("/api/chats"));
    expect(list.status).toBe(401);
    expect(await list.json()).toEqual({ chats: [], signedIn: false });
    expect(
      (await chatById.GET(rq(`/api/chats/${CHAT}`), chatParams(CHAT))).status,
    ).toBe(404);
  });

  it("guest demo chat still streams", async () => {
    h.live = false;
    h.cookieClaims.mockResolvedValue({ data: null, error: null });
    const res = await chat.POST(
      rq("/api/chat", { method: "POST", body: { message: "hi" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/event-stream/);
    await res.text();
  });
});

describe("Origin rules for mutations", () => {
  const patch = (headers: Record<string, string>) =>
    account.PATCH(
      rq("/api/account", {
        method: "PATCH",
        headers,
        body: { displayName: "Mia" },
      }),
    );

  it("verified Bearer without Origin is allowed; cookie without Origin is forbidden", async () => {
    expect((await patch(BEARER)).status).toBe(200);
    const cookieRes = await patch(COOKIE);
    expect(cookieRes.status).toBe(403);
    expect(h.cookieClientCalls).toBe(0);
  });

  it("cookie mutation from another site is forbidden, same-origin allowed", async () => {
    expect(
      (await patch({ ...COOKIE, origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await patch({ ...COOKIE, origin: ORIGIN })).status).toBe(200);
    expect(h.profileWrites.at(-1)).toEqual({
      id: "cookie-user",
      displayName: "Mia",
    });
  });

  it("import keeps the JSON content-type check for Bearer requests", async () => {
    const res = await importRoute.POST(
      new Request(`${ORIGIN}/api/chats/import`, {
        method: "POST",
        headers: { ...BEARER, "content-type": "text/plain" },
        body: JSON.stringify({ chats: [] }),
      }),
    );
    expect(res.status).toBe(403);
    expect(h.importTabChats).not.toHaveBeenCalled();
  });
});

describe("no Supabase env", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  });

  it("a Bearer token is refused (nothing can verify it)", async () => {
    expect(
      (await account.GET(rq("/api/account", { headers: BEARER }))).status,
    ).toBe(401);
    expect(h.getClaims).not.toHaveBeenCalled();
  });

  it("without a token the account endpoint reports sign-in disabled", async () => {
    h.cookieClaims.mockResolvedValue({ data: null, error: null });
    const body = await (await account.GET(rq("/api/account"))).json();
    expect(body.enabled).toBe(false);
    expect(body.account).toBeNull();
  });
});

describe("Supabase Auth unavailable -> 503 with Retry-After, never guest or cookie", () => {
  const retryable = () =>
    h.getClaims.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("fetch failed"), {
        name: "AuthRetryableFetchError",
        status: 0,
        __isAuthError: true,
      }),
    });
  const withCookie = { ...BEARER, ...COOKIE, origin: ORIGIN };

  const expect503 = async (res: Response) => {
    expect(res.status).toBe(503);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect((await res.json()).code).toBe("auth_unavailable");
  };

  it("every route answers 503 and touches no cookie, database or model", async () => {
    retryable();
    await expect503(
      await account.GET(rq("/api/account", { headers: withCookie })),
    );
    await expect503(
      await account.PATCH(
        rq("/api/account", {
          method: "PATCH",
          headers: withCookie,
          body: { displayName: "x" },
        }),
      ),
    );
    await expect503(await chats.GET(rq("/api/chats", { headers: withCookie })));
    await expect503(
      await chatById.GET(
        rq(`/api/chats/${CHAT}`, { headers: withCookie }),
        chatParams(CHAT),
      ),
    );
    await expect503(
      await importRoute.POST(
        rq("/api/chats/import", {
          method: "POST",
          headers: withCookie,
          body: { chats: [] },
        }),
      ),
    );
    for (const live of [true, false]) {
      h.live = live;
      await expect503(
        await chat.POST(
          rq("/api/chat", {
            method: "POST",
            headers: withCookie,
            body: { message: "hi", chatId: CHAT },
          }),
        ),
      );
    }
    expect(h.cookieClientCalls).toBe(0);
    expect(h.profileWrites).toHaveLength(0);
    expect(h.listChats).not.toHaveBeenCalled();
    expect(h.loadChat).not.toHaveBeenCalled();
    expect(h.importTabChats).not.toHaveBeenCalled();
    expect(h.appendTurn).not.toHaveBeenCalled();
    expect(h.inputs).toHaveLength(0);
  });

  it("recovers once Auth answers again (the failure was not remembered)", async () => {
    retryable();
    expect(
      (await account.GET(rq("/api/account", { headers: BEARER }))).status,
    ).toBe(503);
    h.getClaims.mockResolvedValue({
      data: { claims: goodClaims() },
      error: null,
    });
    expect(
      (await account.GET(rq("/api/account", { headers: BEARER }))).status,
    ).toBe(200);
  });
});

describe("demo chat skips the cookie lookup", () => {
  it("a guest demo turn never builds the cookie client", async () => {
    h.live = false;
    const res = await chat.POST(
      rq("/api/chat", {
        method: "POST",
        headers: COOKIE,
        body: { message: "hi" },
      }),
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(h.cookieClientCalls).toBe(0);
  });

  it("a live turn still reads the cookie session and saves under it", async () => {
    const res = await chat.POST(
      rq("/api/chat", {
        method: "POST",
        headers: COOKIE,
        body: { message: "hi", chatId: CHAT },
      }),
    );
    await res.text();
    expect(h.cookieClientCalls).toBe(1);
    expect(h.inputs[0].userId).toBe("cookie-user");
  });
});
