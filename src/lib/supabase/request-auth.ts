import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./config";
import { createClient as createCookieClient } from "./server";

/**
 * Who sent this API request, verified per request.
 *
 * - Any `Authorization` header selects the Bearer path (the native app).
 *   The token must be a Supabase access token for this project. Cheap,
 *   untrusted checks run first (shape, header, signature length and the
 *   claims we would require anyway), then the token is always verified
 *   cryptographically with `getClaims(jwt)` on a cookie-less,
 *   non-persisting client and its verified claims are checked again.
 *   Rejected tokens are `invalid` (401). Cookies are never consulted as a
 *   fallback and an invalid token is never served as a guest.
 * - If verification could not finish because Supabase Auth or its JWKS
 *   endpoint was unreachable/5xx/rate-limited, or this instance's remote
 *   verification budget is spent, the result is `unavailable` (503 with
 *   Retry-After). That is a refusal too: never a guest, never a cookie.
 * - No `Authorization` header: the web's cookie session via the existing
 *   helper, unchanged. A missing or unverifiable cookie session is `guest`.
 *
 * Bounding remote work (per server instance only, see VERIFY_LIMITS):
 * asymmetric (ES256/RS256) tokens are checked against this module's own
 * cached JWKS and passed to `getClaims` with `{ jwks }`, so the SDK never
 * fetches keys for an unknown `kid`; the JWKS itself is refetched at most
 * once per `jwksMinRefreshMs` (and once per `jwksFailureCooldownMs` after a
 * failure). HS256 tokens (legacy shared-secret projects) still verify
 * through Supabase Auth, as the SDK does, but each such call takes a slot
 * from a per-instance token bucket with a concurrency cap. Identical
 * tokens share one in-flight verification and recently rejected tokens
 * are remembered (by SHA-256, bounded LRU). None of this is a distributed
 * or global limit: every serverless instance has its own counters.
 */
export type RequestIdentity =
  | {
      kind: "authenticated";
      userId: string;
      email: string | null;
      method: "bearer" | "cookie";
    }
  | { kind: "guest" }
  | { kind: "invalid"; reason: InvalidReason }
  | {
      kind: "unavailable";
      reason: UnavailableReason;
      retryAfterSec: number;
    };

export type InvalidReason =
  | "malformed"
  | "oversized"
  | "not_configured"
  | "header"
  | "unknown_key"
  | "unverified"
  | "claims";

/** `auth_unavailable`: Supabase Auth/JWKS failed transiently; `busy`: this instance's verification budget is spent. */
export type UnavailableReason = "auth_unavailable" | "busy";

/** Longest Authorization header accepted (Supabase access tokens are ~1 KB). */
export const MAX_AUTHORIZATION_LENGTH = 4096;

/** Per-instance bounds on verification work. Not shared across instances. */
export const VERIFY_LIMITS = {
  /** Token-bucket burst for verifications that call Supabase Auth (HS256). */
  remoteBurst: 30,
  /** Bucket refill, verifications per second. */
  remoteRefillPerSec: 5,
  /** Concurrent Supabase Auth verifications. */
  remoteMaxInFlight: 16,
  /** How long a rejected token is remembered. */
  negativeTtlMs: 5 * 60 * 1000,
  /** Rejected tokens remembered (oldest evicted first). */
  negativeMax: 2048,
  /** JWKS considered fresh for (matches the SDK's JWKS_TTL). */
  jwksTtlMs: 10 * 60 * 1000,
  /** An unknown `kid` refetches the JWKS at most this often. */
  jwksMinRefreshMs: 30 * 1000,
  /** After a failed JWKS fetch, no new fetch for this long. */
  jwksFailureCooldownMs: 5 * 1000,
  jwksTimeoutMs: 3 * 1000,
  /** Retry-After for `auth_unavailable`. */
  retryAfterSec: 5,
} as const;

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Base64url signature length per algorithm (unpadded). */
const SIGNATURE_CHARS: Record<SupportedAlg, (n: number) => boolean> = {
  HS256: (n) => n === 43, // 32 bytes
  ES256: (n) => n === 86, // 64 bytes (r||s on P-256)
  RS256: (n) => n >= 342 && n <= 683, // 2048..4096-bit modulus
};
type SupportedAlg = "HS256" | "ES256" | "RS256";
const isSupportedAlg = (alg: unknown): alg is SupportedAlg =>
  alg === "HS256" || alg === "ES256" || alg === "RS256";

export const GUEST: RequestIdentity = { kind: "guest" };

/**
 * `cookie: false` skips the cookie session lookup when there is no
 * Authorization header (the caller does not need a user, e.g. a demo turn).
 * An Authorization header is always verified, so an invalid one still wins.
 */
export async function resolveRequestIdentity(
  request: Request,
  options: { cookie?: boolean } = {},
): Promise<RequestIdentity> {
  const header = request.headers.get("authorization");
  if (header !== null) return verifyBearer(header);
  if (options.cookie === false) return GUEST;
  return cookieIdentity();
}

/** The verified user id, or null for guests and refused credentials. */
export function identityUserId(identity: RequestIdentity): string | null {
  return identity.kind === "authenticated" ? identity.userId : null;
}

/** True only for a verified native Bearer identity (exempt from Origin checks). */
export function isBearerIdentity(identity: RequestIdentity): boolean {
  return identity.kind === "authenticated" && identity.method === "bearer";
}

/** The 401 for a rejected Authorization header. Never echoes the token. */
export function invalidCredentialsResponse(): Response {
  return Response.json(
    { error: "Sign in again" },
    {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
    },
  );
}

/**
 * The 503 when a token could not be verified right now. No
 * WWW-Authenticate: the credentials were not judged invalid, so the client
 * should retry later rather than sign out.
 */
export function authUnavailableResponse(retryAfterSec: number): Response {
  return Response.json(
    {
      error: "Sign-in check is unavailable. Try again shortly.",
      code: "auth_unavailable",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterSec))),
      },
    },
  );
}

/**
 * The response for a refused identity (401 invalid, 503 unavailable), or
 * null when the request may continue as authenticated or guest. Every
 * route calls this right after `resolveRequestIdentity`.
 */
export function identityRefusal(identity: RequestIdentity): Response | null {
  if (identity.kind === "invalid") return invalidCredentialsResponse();
  if (identity.kind === "unavailable")
    return authUnavailableResponse(identity.retryAfterSec);
  return null;
}

export async function verifyBearer(header: string): Promise<RequestIdentity> {
  if (header.length > MAX_AUTHORIZATION_LENGTH)
    return { kind: "invalid", reason: "oversized" };
  const match = BEARER.exec(header.trim());
  if (!match) return { kind: "invalid", reason: "malformed" };
  const token = match[1];

  const env = supabaseEnv();
  if (!env) return { kind: "invalid", reason: "not_configured" };

  const pre = inspectUntrustedToken(token, env.url);
  if (!pre.ok) return pre.identity;

  const key = await tokenKey(token);
  const known = rememberedInvalid(key);
  if (known) return { kind: "invalid", reason: known };
  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = verifyFresh(token, pre, env)
    .then((identity) => {
      if (identity.kind === "invalid") rememberInvalid(key, identity.reason);
      return identity;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

type Inspected =
  | { ok: true; alg: SupportedAlg; kid: string | null }
  | { ok: false; identity: RequestIdentity };

/**
 * Untrusted pre-checks on the decoded header and payload. They only ever
 * reject: a token that passes is still verified cryptographically.
 */
export function inspectUntrustedToken(
  token: string,
  projectUrl: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Inspected {
  const reject = (reason: InvalidReason): Inspected => ({
    ok: false,
    identity: { kind: "invalid", reason },
  });
  const [rawHeader, rawPayload, rawSignature] = token.split(".");
  const header = decodeSegment(rawHeader);
  if (!isRecord(header)) return reject("header");
  const alg = header.alg;
  if (!isSupportedAlg(alg)) return reject("header");
  // Native Bearer support is new; legacy shared-secret verification is an
  // explicit compatibility opt-in after the operator checks the project's
  // signing keys. Browser cookie authentication is unchanged.
  if (alg === "HS256" && process.env.SHOLAM_ALLOW_LEGACY_JWT !== "true")
    return reject("header");
  if (header.typ !== undefined && header.typ !== "JWT") return reject("header");
  if (header.crit !== undefined) return reject("header");
  const kid = header.kid;
  if (kid !== undefined && (typeof kid !== "string" || !KID.test(kid)))
    return reject("header");
  // Supabase's asymmetric keys always carry a kid; without one the SDK
  // would fall back to a remote check, so refuse instead.
  if (alg !== "HS256" && kid === undefined) return reject("header");
  if (!SIGNATURE_CHARS[alg](rawSignature?.length ?? 0)) return reject("header");

  const payload = decodeSegment(rawPayload);
  if (!isRecord(payload)) return reject("claims");
  const claimed = identityFromClaims(payload, projectUrl, nowSec);
  if (claimed.kind !== "authenticated") return { ok: false, identity: claimed };
  return { ok: true, alg, kid: typeof kid === "string" ? kid : null };
}

/** Additional claim checks beyond the signature/expiry `getClaims` verifies. */
export function identityFromClaims(
  claims: Record<string, unknown> | undefined,
  projectUrl: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): RequestIdentity {
  const bad: RequestIdentity = { kind: "invalid", reason: "claims" };
  if (!claims) return bad;
  if (claims.iss !== `${projectUrl.replace(/\/+$/, "")}/auth/v1`) return bad;
  const aud = claims.aud;
  const audOk = Array.isArray(aud)
    ? aud.includes("authenticated")
    : aud === "authenticated";
  if (!audOk) return bad;
  if (claims.role !== "authenticated") return bad;
  if (claims.is_anonymous === true) return bad;
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return bad;
  const sub = claims.sub;
  if (typeof sub !== "string" || !UUID.test(sub)) return bad;
  return {
    kind: "authenticated",
    userId: sub.toLowerCase(),
    email: typeof claims.email === "string" ? claims.email : null,
    method: "bearer",
  };
}

/**
 * True for SDK errors that say "could not check right now", not "this
 * token is bad": network failures and 5xx (AuthRetryableFetchError),
 * unparseable responses (AuthUnknownError) and Auth rate limiting (429).
 * Duck-typed by name/status so it holds across SDK copies.
 */
export function isTransientAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  if (name === "AuthRetryableFetchError" || name === "AuthUnknownError")
    return true;
  return (
    name === "AuthApiError" &&
    typeof status === "number" &&
    (status === 429 || status >= 500)
  );
}

const unavailable = (
  reason: UnavailableReason,
  retryAfterSec: number = VERIFY_LIMITS.retryAfterSec,
): RequestIdentity => ({ kind: "unavailable", reason, retryAfterSec });

async function verifyFresh(
  token: string,
  pre: { alg: SupportedAlg; kid: string | null },
  env: { url: string; key: string },
): Promise<RequestIdentity> {
  const remote = pre.alg === "HS256" || !hasWebCrypto() || pre.kid === null;
  let jwks: { keys: Jwk[] } | undefined;
  let release: (() => void) | undefined;

  if (remote) {
    const slot = takeRemoteSlot();
    if (!slot.ok) return unavailable("busy", slot.retryAfterSec);
    release = slot.release;
  } else {
    const keys = await signingKeysFor(env, pre.kid as string);
    if (keys.kind === "unavailable") return unavailable("auth_unavailable");
    if (keys.kind === "unknown")
      return { kind: "invalid", reason: "unknown_key" };
    jwks = { keys: keys.keys };
  }

  let claims: Record<string, unknown> | undefined;
  try {
    const auth = verifierFor(env).auth;
    const { data, error } = jwks
      ? await auth.getClaims(token, { jwks: jwks as never })
      : await auth.getClaims(token);
    if (error) {
      return isTransientAuthError(error)
        ? unavailable("auth_unavailable")
        : { kind: "invalid", reason: "unverified" };
    }
    if (!data) return { kind: "invalid", reason: "unverified" };
    claims = data.claims as Record<string, unknown>;
  } catch (error) {
    // The SDK returns AuthErrors; anything thrown is either a transient
    // AuthError or a key/algorithm mismatch on an attacker-chosen token.
    return isTransientAuthError(error)
      ? unavailable("auth_unavailable")
      : { kind: "invalid", reason: "unverified" };
  } finally {
    release?.();
  }
  return identityFromClaims(claims, env.url);
}

// ---------------------------------------------------------------------------
// Per-instance state. Exported reset is for tests only.

type Jwk = { kid: string; kty: string; [k: string]: unknown };

const inFlight = new Map<string, Promise<RequestIdentity>>();
const negative = new Map<string, { reason: InvalidReason; until: number }>();
const bucket = {
  tokens: VERIFY_LIMITS.remoteBurst as number,
  at: 0,
  inFlight: 0,
};
let jwksState: {
  source: string;
  keys: Jwk[];
  fetchedAt: number;
  failedAt: number;
  pending: Promise<boolean> | null;
} | null = null;

/** Clears caches, budgets and the JWKS (tests only). */
export function resetBearerVerifierForTests(): void {
  inFlight.clear();
  negative.clear();
  bucket.tokens = VERIFY_LIMITS.remoteBurst;
  bucket.at = 0;
  bucket.inFlight = 0;
  jwksState = null;
  verifier = null;
}

function takeRemoteSlot():
  | { ok: true; release: () => void }
  | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const elapsedSec = Math.max(0, now - bucket.at) / 1000;
  bucket.tokens = Math.min(
    VERIFY_LIMITS.remoteBurst,
    bucket.tokens + elapsedSec * VERIFY_LIMITS.remoteRefillPerSec,
  );
  bucket.at = now;
  if (bucket.inFlight >= VERIFY_LIMITS.remoteMaxInFlight)
    return { ok: false, retryAfterSec: 1 };
  if (bucket.tokens < 1) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((1 - bucket.tokens) / VERIFY_LIMITS.remoteRefillPerSec),
      ),
    };
  }
  bucket.tokens -= 1;
  bucket.inFlight += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      bucket.inFlight -= 1;
    },
  };
}

function rememberedInvalid(key: string): InvalidReason | null {
  const hit = negative.get(key);
  if (!hit) return null;
  if (hit.until <= Date.now()) {
    negative.delete(key);
    return null;
  }
  return hit.reason;
}

function rememberInvalid(key: string, reason: InvalidReason): void {
  negative.delete(key);
  while (negative.size >= VERIFY_LIMITS.negativeMax) {
    const oldest = negative.keys().next().value;
    if (oldest === undefined) break;
    negative.delete(oldest);
  }
  negative.set(key, {
    reason,
    until: Date.now() + VERIFY_LIMITS.negativeTtlMs,
  });
}

/** SHA-256 of the token, so caches never hold the token itself. */
async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * The project's public signing keys for `kid`. `unknown` only after a
 * JWKS fetch within the last `jwksMinRefreshMs` lacked the kid (Supabase
 * publishes a key before signing with it); `unavailable` when the JWKS
 * cannot be fetched (or a recent fetch failed).
 */
async function signingKeysFor(
  env: { url: string; key: string },
  kid: string,
): Promise<
  { kind: "ok"; keys: Jwk[] } | { kind: "unknown" } | { kind: "unavailable" }
> {
  const source = env.url.replace(/\/+$/, "");
  if (jwksState?.source !== source) {
    jwksState = { source, keys: [], fetchedAt: 0, failedAt: 0, pending: null };
  }
  const state = jwksState;
  const find = () => state.keys.filter((k) => k.kid === kid);
  const now = Date.now();
  const fresh =
    state.fetchedAt > 0 && now - state.fetchedAt < VERIFY_LIMITS.jwksTtlMs;
  if (fresh && find().length) return { kind: "ok", keys: find() };
  if (fresh && now - state.fetchedAt < VERIFY_LIMITS.jwksMinRefreshMs)
    return { kind: "unknown" };
  if (!state.pending) {
    if (
      state.failedAt > 0 &&
      now - state.failedAt < VERIFY_LIMITS.jwksFailureCooldownMs
    )
      return { kind: "unavailable" };
    state.pending = fetchJwks(source, env.key)
      .then((keys) => {
        state.keys = keys;
        state.fetchedAt = Date.now();
        return true;
      })
      .catch(() => {
        state.failedAt = Date.now();
        return false;
      })
      .finally(() => {
        state.pending = null;
      });
  }
  if (!(await state.pending)) return { kind: "unavailable" };
  const keys = find();
  return keys.length ? { kind: "ok", keys } : { kind: "unknown" };
}

async function fetchJwks(projectUrl: string, apiKey: string): Promise<Jwk[]> {
  const res = await fetch(`${projectUrl}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(VERIFY_LIMITS.jwksTimeoutMs),
  });
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const body: unknown = await res.json();
  const keys = isRecord(body) && Array.isArray(body.keys) ? body.keys : null;
  if (!keys) throw new Error("JWKS shape");
  return keys.filter(
    (k): k is Jwk =>
      isRecord(k) &&
      typeof k.kid === "string" &&
      (k.kty === "EC" || k.kty === "RSA"),
  );
}

function hasWebCrypto(): boolean {
  return "crypto" in globalThis && "subtle" in globalThis.crypto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSegment(segment: string | undefined): unknown {
  if (!segment) return undefined;
  try {
    const b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/** Bound SDK Auth calls too (the opt-in HS256/getUser path in particular).
 * Compose rather than overwrite caller cancellation. */
function fetchWithAuthDeadline(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const signals = [AbortSignal.timeout(VERIFY_LIMITS.jwksTimeoutMs)];
  if (init?.signal) signals.push(init.signal);
  if (input instanceof Request && input.signal) signals.push(input.signal);
  return fetch(input, { ...init, signal: AbortSignal.any(signals) });
}

// One stateless verifier per project: never signs in, stores or refreshes a
// session. Keys are supplied per call, so it holds no request data.
let verifier: {
  key: string;
  client: ReturnType<typeof createSupabaseClient>;
} | null = null;

function verifierFor(env: { url: string; key: string }) {
  const key = `${env.url}\n${env.key}`;
  if (verifier?.key !== key) {
    verifier = {
      key,
      client: createSupabaseClient(env.url, env.key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: fetchWithAuthDeadline },
      }),
    };
  }
  return verifier.client;
}

/** The web's cookie session, exactly as `currentUserId`/`getAccount` read it. */
async function cookieIdentity(): Promise<RequestIdentity> {
  const supabase = await createCookieClient();
  if (!supabase) return GUEST;
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return GUEST;
    return {
      kind: "authenticated",
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      method: "cookie",
    };
  } catch {
    return GUEST;
  }
}
