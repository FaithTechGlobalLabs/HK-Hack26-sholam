import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * request-auth with fake Supabase clients and a fake JWKS fetch. No real
 * project, network or secrets.
 */
const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  createOptions: [] as unknown[],
  cookieClaims: vi.fn(),
  cookieClientCalls: 0,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    h.createOptions.push(options);
    return { auth: { getClaims: h.getClaims } };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    h.cookieClientCalls++;
    return { auth: { getClaims: h.cookieClaims } };
  },
}));

const {
  resolveRequestIdentity,
  identityFromClaims,
  identityRefusal,
  inspectUntrustedToken,
  isBearerIdentity,
  isTransientAuthError,
  resetBearerVerifierForTests,
  MAX_AUTHORIZATION_LENGTH,
  VERIFY_LIMITS,
} = await import("@/lib/supabase/request-auth");

const URL_ = "https://proj.supabase.co";
const JWKS_URL = `${URL_}/auth/v1/.well-known/jwks.json`;
const USER = "6f1c2a8e-3b4d-4e5f-9a0b-1c2d3e4f5a6b";
const KEY = { kid: "k1", kty: "EC", crv: "P-256", x: "x", y: "y" };
const now = () => Math.floor(Date.now() / 1000);
const SIG = { ES256: 86, HS256: 43, RS256: 342 } as Record<string, number>;

function claims(over: Record<string, unknown> = {}) {
  return {
    iss: `${URL_}/auth/v1`,
    aud: "authenticated",
    role: "authenticated",
    sub: USER,
    email: "a@example.com",
    exp: now() + 600,
    iat: now(),
    is_anonymous: false,
    ...over,
  };
}

const seg = (v: unknown) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString(
    "base64url",
  );

function jwt(
  header: Record<string, unknown> = { alg: "ES256", typ: "JWT", kid: "k1" },
  payload: unknown = claims(),
  sigChars = SIG[String(header.alg)] ?? 86,
) {
  return `${seg(header)}.${seg(payload)}.${"A".repeat(sigChars)}`;
}
const hs256 = (payload: unknown = claims()) =>
  jwt({ alg: "HS256", typ: "JWT" }, payload);

const authError = (name: string, status?: number) =>
  Object.assign(new Error(name), { name, status, __isAuthError: true });

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/account", { headers });
const bearer = (token: string, extra: Record<string, string> = {}) =>
  req({ authorization: `Bearer ${token}`, ...extra });

const fetchMock = vi.fn();
const jwksOk = (keys: unknown[] = [KEY]) =>
  fetchMock.mockImplementation(async () => Response.json({ keys }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  // Legacy-path tests opt in deliberately; the deployed default is off.
  vi.stubEnv("SHOLAM_ALLOW_LEGACY_JWT", "true");
  vi.stubGlobal("fetch", fetchMock);
  resetBearerVerifierForTests();
  fetchMock.mockReset();
  jwksOk();
  h.getClaims.mockReset();
  h.cookieClaims.mockReset();
  h.cookieClientCalls = 0;
  h.getClaims.mockImplementation(async (token: string) => ({
    data: {
      claims: JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ),
      header: {},
      signature: new Uint8Array(),
    },
    error: null,
  }));
  h.cookieClaims.mockResolvedValue({
    data: { claims: { sub: "cookie-user", email: "c@example.com" } },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("resolveRequestIdentity: Bearer path", () => {
  it("verifies an ES256 token against the cached JWKS and never lets the SDK fetch keys", async () => {
    const token = jwt();
    const id = await resolveRequestIdentity(bearer(token));
    expect(id).toEqual({
      kind: "authenticated",
      userId: USER,
      email: "a@example.com",
      method: "bearer",
    });
    expect(isBearerIdentity(id)).toBe(true);
    expect(h.getClaims).toHaveBeenCalledWith(token, { jwks: { keys: [KEY] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(JWKS_URL);
    expect(init.headers).toEqual({ apikey: "sb_publishable_test" });
    expect(h.cookieClientCalls).toBe(0);

    // Second token with the same kid: no new JWKS fetch.
    await resolveRequestIdentity(bearer(jwt(undefined, claims({ jti: "2" }))));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy HS256 before any Auth call unless explicitly enabled", async () => {
    vi.stubEnv("SHOLAM_ALLOW_LEGACY_JWT", "false");
    expect(await resolveRequestIdentity(bearer(hs256()))).toEqual({
      kind: "invalid",
      reason: "header",
    });
    expect(h.getClaims).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds SDK Auth fetches and preserves caller cancellation", async () => {
    await resolveRequestIdentity(bearer(hs256()));
    const options = h.createOptions.at(-1) as {
      global: { fetch: typeof fetch };
    };
    const original = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await options.global.fetch(`${URL_}/auth/v1/user`, {
        signal: original.signal,
      });
      const forwarded = fetchMock.mock.calls.at(-1)?.[1]?.signal as AbortSignal;
      expect(forwarded).toBeInstanceOf(AbortSignal);
      original.abort();
      expect(forwarded.aborted).toBe(true);
      expect(timeout).toHaveBeenCalledWith(VERIFY_LIMITS.jwksTimeoutMs);
    } finally {
      timeout.mockRestore();
    }
  });

  it("keeps legacy HS256 tokens working through Supabase Auth, without a JWKS fetch", async () => {
    const token = hs256();
    const id = await resolveRequestIdentity(bearer(token));
    expect(id.kind).toBe("authenticated");
    expect(h.getClaims).toHaveBeenCalledWith(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies on a non-persisting, non-refreshing client", async () => {
    await resolveRequestIdentity(bearer(hs256()));
    expect(h.createOptions.at(-1)).toMatchObject({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  });

  it("rejects an invalid token even with a valid cookie session", async () => {
    h.getClaims.mockResolvedValue({
      data: null,
      error: authError("AuthInvalidJwtError", 400),
    });
    const id = await resolveRequestIdentity(
      bearer(jwt(), { cookie: "sb-proj-auth-token=valid" }),
    );
    expect(id).toEqual({ kind: "invalid", reason: "unverified" });
    expect(h.cookieClientCalls).toBe(0);
  });

  it.each([
    ["AuthApiError 401", authError("AuthApiError", 401)],
    ["AuthApiError 403", authError("AuthApiError", 403)],
    ["session missing", authError("AuthSessionMissingError", 400)],
    ["plain Error", new Error("bad jwt")],
  ])("a returned %s is invalid (401)", async (_n, error) => {
    h.getClaims.mockResolvedValue({ data: null, error });
    expect(await resolveRequestIdentity(bearer(hs256()))).toEqual({
      kind: "invalid",
      reason: "unverified",
    });
  });

  it.each([
    ["network failure", authError("AuthRetryableFetchError", 0)],
    ["Auth 503", authError("AuthRetryableFetchError", 503)],
    ["Auth 500 api error", authError("AuthApiError", 500)],
    ["Auth rate limited", authError("AuthApiError", 429)],
    ["unparseable response", authError("AuthUnknownError")],
  ])("a returned %s is unavailable (503), not invalid", async (_n, error) => {
    h.getClaims.mockResolvedValue({ data: null, error });
    expect(await resolveRequestIdentity(bearer(hs256()))).toEqual({
      kind: "unavailable",
      reason: "auth_unavailable",
      retryAfterSec: VERIFY_LIMITS.retryAfterSec,
    });
    expect(h.cookieClientCalls).toBe(0);
  });

  it("a thrown retryable SDK error is unavailable; other throws are invalid", async () => {
    h.getClaims.mockRejectedValueOnce(authError("AuthRetryableFetchError", 0));
    expect((await resolveRequestIdentity(bearer(hs256()))).kind).toBe(
      "unavailable",
    );
    h.getClaims.mockRejectedValueOnce(new DOMException("bad key", "DataError"));
    expect(await resolveRequestIdentity(bearer(jwt()))).toEqual({
      kind: "invalid",
      reason: "unverified",
    });
  });

  it("does not remember transient failures: the next attempt verifies again", async () => {
    const token = hs256();
    h.getClaims.mockResolvedValueOnce({
      data: null,
      error: authError("AuthRetryableFetchError", 502),
    });
    expect((await resolveRequestIdentity(bearer(token))).kind).toBe(
      "unavailable",
    );
    expect((await resolveRequestIdentity(bearer(token))).kind).toBe(
      "authenticated",
    );
    expect(h.getClaims).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["empty", ""],
    ["scheme only", "Bearer"],
    ["basic auth", "Basic dXNlcjpwYXNz"],
    ["not a jwt", "Bearer abc"],
    ["two tokens", "Bearer a.b.c, Bearer a.b.c"],
    ["bad characters", "Bearer a.b.c!"],
  ])("rejects a malformed header (%s) without verifying", async (_n, value) => {
    const id = await resolveRequestIdentity(req({ authorization: value }));
    expect(id).toEqual({ kind: "invalid", reason: "malformed" });
    expect(h.getClaims).not.toHaveBeenCalled();
    expect(h.cookieClientCalls).toBe(0);
  });

  it("rejects an oversized header", async () => {
    const big = `Bearer a.${"b".repeat(MAX_AUTHORIZATION_LENGTH)}.c`;
    expect(await resolveRequestIdentity(req({ authorization: big }))).toEqual({
      kind: "invalid",
      reason: "oversized",
    });
    expect(h.getClaims).not.toHaveBeenCalled();
  });

  it("rejects any Bearer token when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await resolveRequestIdentity(bearer(jwt()))).toEqual({
      kind: "invalid",
      reason: "not_configured",
    });
    expect(h.getClaims).not.toHaveBeenCalled();
  });
});

describe("untrusted pre-checks reject before any crypto or network", () => {
  const es = { alg: "ES256", typ: "JWT", kid: "k1" };
  it.each([
    ["alg none", jwt({ alg: "none" }, claims(), 86), "header"],
    ["HS512", jwt({ alg: "HS512" }, claims(), 86), "header"],
    ["ES256 without kid", jwt({ alg: "ES256" }), "header"],
    ["typ other than JWT", jwt({ ...es, typ: "at+jwt" }), "header"],
    ["crit header", jwt({ ...es, crit: ["x"] }), "header"],
    ["kid with odd characters", jwt({ ...es, kid: "../k" }), "header"],
    ["kid not a string", jwt({ ...es, kid: 7 }), "header"],
    ["ES256 short signature", jwt(es, claims(), 40), "header"],
    ["HS256 long signature", jwt({ alg: "HS256" }, claims(), 86), "header"],
    [
      "header not JSON",
      `${seg("nope")}.${seg(claims())}.${"A".repeat(86)}`,
      "header",
    ],
    ["header an array", jwt([] as never, claims(), 86), "header"],
    ["payload not JSON", jwt(es, "nope"), "claims"],
    [
      "other project",
      jwt(es, claims({ iss: "https://x.supabase.co/auth/v1" })),
      "claims",
    ],
    ["expired", jwt(es, claims({ exp: now() - 1 })), "claims"],
    ["anonymous", jwt(es, claims({ is_anonymous: true })), "claims"],
    ["service role", jwt(es, claims({ role: "service_role" })), "claims"],
    ["non-UUID sub", jwt(es, claims({ sub: "user-1" })), "claims"],
  ])("%s", async (_n, token, reason) => {
    expect(await resolveRequestIdentity(bearer(token))).toEqual({
      kind: "invalid",
      reason,
    });
    expect(h.getClaims).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes well-formed tokens of each supported algorithm", () => {
    for (const alg of ["ES256", "RS256", "HS256"]) {
      expect(inspectUntrustedToken(jwt({ alg, kid: "k1" }), URL_)).toEqual({
        ok: true,
        alg,
        kid: "k1",
      });
    }
  });
});

describe("bounded verification work (per instance)", () => {
  it("remembers a rejected token: repeats never reach Supabase again", async () => {
    h.getClaims.mockResolvedValue({
      data: null,
      error: authError("AuthApiError", 401),
    });
    const token = hs256();
    for (let i = 0; i < 25; i++)
      expect((await resolveRequestIdentity(bearer(token))).kind).toBe(
        "invalid",
      );
    expect(h.getClaims).toHaveBeenCalledTimes(1);
  });

  it("forgets a rejection after the negative TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    h.getClaims.mockResolvedValue({
      data: null,
      error: authError("AuthApiError", 401),
    });
    const token = hs256(claims({ exp: now() + 3600 }));
    await resolveRequestIdentity(bearer(token));
    vi.setSystemTime(Date.now() + VERIFY_LIMITS.negativeTtlMs + 1);
    await resolveRequestIdentity(bearer(token));
    expect(h.getClaims).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight verification between identical concurrent tokens", async () => {
    let finish: (v: unknown) => void = () => {};
    h.getClaims.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const token = hs256();
    const all = Promise.all(
      Array.from({ length: 10 }, () => resolveRequestIdentity(bearer(token))),
    );
    await vi.waitFor(() => expect(h.getClaims).toHaveBeenCalledTimes(1));
    finish({ data: { claims: claims() }, error: null });
    const ids = await all;
    expect(ids.every((id) => id.kind === "authenticated")).toBe(true);
    expect(h.getClaims).toHaveBeenCalledTimes(1);
  });

  it("fresh tokens with unknown kids cost at most one JWKS fetch per refresh window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (let i = 0; i < 40; i++) {
      const id = await resolveRequestIdentity(
        bearer(jwt({ alg: "ES256", kid: `kid-${i}` }, claims({ jti: i }))),
      );
      expect(id).toEqual({ kind: "invalid", reason: "unknown_key" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.getClaims).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + VERIFY_LIMITS.jwksMinRefreshMs + 1);
    await resolveRequestIdentity(bearer(jwt({ alg: "ES256", kid: "new" })));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("concurrent unknown kids share one JWKS fetch", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        resolveRequestIdentity(
          bearer(jwt({ alg: "ES256", kid: `c-${i}` }, claims({ jti: i }))),
        ),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a rotated-in key is picked up once the refresh window passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await resolveRequestIdentity(bearer(jwt()));
    jwksOk([KEY, { ...KEY, kid: "k2" }]);
    vi.setSystemTime(Date.now() + VERIFY_LIMITS.jwksMinRefreshMs + 1);
    const id = await resolveRequestIdentity(
      bearer(jwt({ alg: "ES256", kid: "k2" })),
    );
    expect(id.kind).toBe("authenticated");
  });

  it.each([
    [
      "network error",
      () => fetchMock.mockRejectedValue(new TypeError("fetch failed")),
    ],
    [
      "JWKS 503",
      () => fetchMock.mockResolvedValue(new Response("", { status: 503 })),
    ],
    [
      "JWKS not JSON",
      () => fetchMock.mockResolvedValue(new Response("<html>")),
    ],
  ])("JWKS %s is unavailable, with a fetch cooldown", async (_n, arrange) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    arrange();
    for (let i = 0; i < 10; i++) {
      expect(
        await resolveRequestIdentity(
          bearer(jwt(undefined, claims({ jti: i }))),
        ),
      ).toEqual({
        kind: "unavailable",
        reason: "auth_unavailable",
        retryAfterSec: VERIFY_LIMITS.retryAfterSec,
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.getClaims).not.toHaveBeenCalled();

    jwksOk();
    vi.setSystemTime(Date.now() + VERIFY_LIMITS.jwksFailureCooldownMs + 1);
    expect((await resolveRequestIdentity(bearer(jwt()))).kind).toBe(
      "authenticated",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an empty JWKS (shared-secret project) rejects asymmetric tokens but keeps HS256", async () => {
    jwksOk([]);
    expect(await resolveRequestIdentity(bearer(jwt()))).toEqual({
      kind: "invalid",
      reason: "unknown_key",
    });
    expect((await resolveRequestIdentity(bearer(hs256()))).kind).toBe(
      "authenticated",
    );
  });

  it("fresh HS256 tokens spend a per-instance budget; beyond it the answer is busy, not invalid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    h.getClaims.mockResolvedValue({
      data: null,
      error: authError("AuthApiError", 401),
    });
    const results = [];
    for (let i = 0; i < VERIFY_LIMITS.remoteBurst + 10; i++)
      results.push(
        await resolveRequestIdentity(bearer(hs256(claims({ jti: i })))),
      );
    expect(h.getClaims).toHaveBeenCalledTimes(VERIFY_LIMITS.remoteBurst);
    const busy = results.slice(VERIFY_LIMITS.remoteBurst);
    for (const id of busy) {
      expect(id).toMatchObject({ kind: "unavailable", reason: "busy" });
      expect(
        (id as { retryAfterSec: number }).retryAfterSec,
      ).toBeGreaterThanOrEqual(1);
    }

    vi.setSystemTime(Date.now() + 1000);
    for (let i = 0; i < 10; i++)
      await resolveRequestIdentity(bearer(hs256(claims({ jti: `b${i}` }))));
    expect(h.getClaims).toHaveBeenCalledTimes(
      VERIFY_LIMITS.remoteBurst + VERIFY_LIMITS.remoteRefillPerSec,
    );
  });

  it("caps concurrent Supabase Auth verifications", async () => {
    const finishers: ((v: unknown) => void)[] = [];
    h.getClaims.mockImplementation(
      () => new Promise((resolve) => finishers.push(resolve)),
    );
    const n = VERIFY_LIMITS.remoteMaxInFlight + 4;
    const all = Promise.all(
      Array.from({ length: n }, (_, i) =>
        resolveRequestIdentity(bearer(hs256(claims({ jti: i })))),
      ),
    );
    await vi.waitFor(() =>
      expect(h.getClaims).toHaveBeenCalledTimes(
        VERIFY_LIMITS.remoteMaxInFlight,
      ),
    );
    for (const f of finishers) f({ data: { claims: claims() }, error: null });
    const ids = await all;
    expect(ids.filter((id) => id.kind === "unavailable")).toHaveLength(4);
    expect(h.getClaims).toHaveBeenCalledTimes(VERIFY_LIMITS.remoteMaxInFlight);
  });

  it("ES256 verification does not spend the remote budget", async () => {
    for (let i = 0; i < VERIFY_LIMITS.remoteBurst + 5; i++)
      expect(
        (
          await resolveRequestIdentity(
            bearer(jwt(undefined, claims({ jti: i }))),
          )
        ).kind,
      ).toBe("authenticated");
  });
});

describe("refusal responses", () => {
  it("invalid is 401 with WWW-Authenticate", async () => {
    const res = identityRefusal({ kind: "invalid", reason: "unverified" });
    expect(res?.status).toBe(401);
    expect(res?.headers.get("www-authenticate")).toMatch(/invalid_token/);
    expect(res?.headers.get("retry-after")).toBeNull();
  });

  it("unavailable is 503 with Retry-After and no WWW-Authenticate", async () => {
    const res = identityRefusal({
      kind: "unavailable",
      reason: "busy",
      retryAfterSec: 2.2,
    });
    expect(res?.status).toBe(503);
    expect(res?.headers.get("retry-after")).toBe("3");
    expect(res?.headers.get("www-authenticate")).toBeNull();
    expect(res?.headers.get("cache-control")).toBe("private, no-store");
    expect(await res?.json()).toMatchObject({ code: "auth_unavailable" });
  });

  it("authenticated and guest continue", () => {
    expect(identityRefusal({ kind: "guest" })).toBeNull();
    expect(
      identityRefusal({
        kind: "authenticated",
        userId: USER,
        email: null,
        method: "bearer",
      }),
    ).toBeNull();
  });

  it("classifies SDK errors by name and status", () => {
    expect(isTransientAuthError(authError("AuthRetryableFetchError", 0))).toBe(
      true,
    );
    expect(isTransientAuthError(authError("AuthApiError", 504))).toBe(true);
    expect(isTransientAuthError(authError("AuthApiError", 400))).toBe(false);
    expect(isTransientAuthError(authError("AuthInvalidJwtError", 400))).toBe(
      false,
    );
    expect(isTransientAuthError(new TypeError("fetch failed"))).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
  });
});

describe("identityFromClaims", () => {
  const ok = (c: Record<string, unknown>) =>
    identityFromClaims(c, URL_).kind === "authenticated";

  it("accepts the expected claims, a trailing-slash project URL and audience arrays", () => {
    expect(ok(claims())).toBe(true);
    expect(identityFromClaims(claims(), `${URL_}/`).kind).toBe("authenticated");
    expect(ok(claims({ aud: ["other", "authenticated"] }))).toBe(true);
    expect(ok(claims({ email: undefined }))).toBe(true);
  });

  it.each([
    ["wrong project issuer", { iss: "https://other.supabase.co/auth/v1" }],
    ["missing issuer", { iss: undefined }],
    ["anon audience", { aud: "anon" }],
    ["audience array without authenticated", { aud: ["anon"] }],
    ["anon role", { role: "anon" }],
    ["service role", { role: "service_role" }],
    ["non-UUID subject", { sub: "user-1" }],
    ["missing subject", { sub: undefined }],
    ["anonymous user", { is_anonymous: true }],
    ["expired", { exp: now() - 1 }],
    ["missing exp", { exp: undefined }],
  ])("rejects %s", (_n, over) => {
    expect(identityFromClaims(claims(over), URL_)).toEqual({
      kind: "invalid",
      reason: "claims",
    });
  });

  it("rejects a token whose verified claims fail after a successful signature check", async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: claims({ role: "service_role" }) },
      error: null,
    });
    expect(await resolveRequestIdentity(bearer(jwt()))).toEqual({
      kind: "invalid",
      reason: "claims",
    });
  });
});

describe("resolveRequestIdentity: cookie path (no Authorization header)", () => {
  it("keeps the web cookie session", async () => {
    const id = await resolveRequestIdentity(req({ cookie: "sb=1" }));
    expect(id).toEqual({
      kind: "authenticated",
      userId: "cookie-user",
      email: "c@example.com",
      method: "cookie",
    });
    expect(isBearerIdentity(id)).toBe(false);
    expect(h.getClaims).not.toHaveBeenCalled();
  });

  it("is a guest when there is no cookie session", async () => {
    h.cookieClaims.mockResolvedValue({ data: null, error: null });
    expect(await resolveRequestIdentity(req())).toEqual({ kind: "guest" });
  });

  it("cookie: false skips the cookie lookup but still verifies a Bearer header", async () => {
    expect(
      await resolveRequestIdentity(req({ cookie: "sb=1" }), { cookie: false }),
    ).toEqual({ kind: "guest" });
    expect(h.cookieClientCalls).toBe(0);
    h.getClaims.mockResolvedValue({
      data: null,
      error: authError("AuthApiError", 401),
    });
    expect(
      await resolveRequestIdentity(bearer(hs256(), { cookie: "sb=1" }), {
        cookie: false,
      }),
    ).toEqual({ kind: "invalid", reason: "unverified" });
  });
});
