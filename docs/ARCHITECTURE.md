# sholam architecture

Last updated: 2026-11-14

## Shape

```
Browser (React client components)
  ChatView ── POST /api/chat ──────────────► route handler ──► harness.runAgentTurn
     ▲            (SSE: AgentEvent frames)                     │  OpenRouter chat completions (stream)
     └── SseDecoder ◄──────────────────────────────────────────┤  tools ──► BSB (`verses` table; helloao without a DB) + deck
  FlashcardsView ◄── cached deck in the static /flashcards page (deck.ts ──► repo)
  FlashcardsView ── POST /api/flashcards ──► repo ─────────────┘
  LoginForm ── signInWithOtp ──► one email: 8-digit code + link
     ├─ code ──► verifyOtp (this browser)
     └─ link ──► /auth/confirm (button) ──► POST /auth/verify ──► verifyOtp (token_hash)
  Sidebar / Chats panel ── GET /api/account, GET /api/chats ──► chat store (per user)
src/proxy.ts refreshes the Supabase session cookie on page requests.
```

Without env vars the app still runs: `/api/chat` streams `lib/agent/demo.ts`, and flashcards come from `data/flashcards.seed.json`. With `OPENROUTER_API_KEY` set (and `SHOLAM_AGENT` not `demo`), Chat runs Shalom Guide live.

## Agent harness (`src/lib/agent/`)

**Why a manual loop:** we need our own event stream to the browser (verse records, card hits, proposals) alongside text, so we drive OpenRouter streaming ourselves.

**Provider** (`openrouter.ts`): OpenAI-compatible `POST {OPENROUTER_BASE_URL}/chat/completions` with `Authorization: Bearer` from `OPENROUTER_API_KEY` (server only). Model from `SHOLAM_MODEL`, free `:free` ids only (default `nvidia/nemotron-3-ultra-550b-a55b:free`; any other id falls back to it). Reasoning is `effort: low` and excluded from the reply; any leaked `<think>` text is stripped (`reasoning-filter.ts`). Nemotron sometimes writes a tool call into the streamed text (`<tool_call><function=…><parameter=…>…`, or the Hermes JSON form) instead of a `tool_calls` delta; `tool-call-text.ts` holds back anything that could be the start of such a block, so no partial tag reaches the user, and turns complete blocks into real tool calls. Every request sends the same tool list (byte-stable prompt); when tools are not offered it sends `tool_choice: "none"`. Providers are sorted by latency under a price cap. Timeouts ~45s; `temperature` 0.4; `max_tokens` from `LIMITS.model`. Free models are spaced under OpenRouter's 20/minute cap. The caller's `AbortSignal` cancels the request, the stream and any retry wait (`TurnAborted`, never reported as an error).

**Request** (`context.ts`): `buildPromptParts` keeps the newest history turns within `LIMITS.model` (count, per-turn and total characters), the last few user questions and at most three matched-card lines for the trailing session note. `assemblePrompt` builds `[SYSTEM_PROMPT, ...history, question + note, ...this turn's tool calls and results]` and, if it is over `promptChars`, drops the oldest history first, then clips the longest tool results. The system prompt and tool list are never edited per request (prompt caching).

**Loop**, per user turn (`harness.ts`), at most `LIMITS.turn.maxModelCalls` (4) requests:

1. Before each request, `reserveModelCall()` counts it against the global daily ceiling; when the ceiling is reached the turn ends with a friendly `error`.
2. Stream a completion; forward text as `text_delta`. Tools are offered (`tool_choice: auto`) for up to `maxToolRounds` (2) rounds while a request is left to answer with.
3. On tool calls: if the model wrote a preamble first, send `reset` (the browser clears it). Validate each input with its zod schema, run the tools (each gets the abort signal), emit `tool_start` / `tool_result` (and `verses` / `flashcards` / `flashcard_proposal`), append clipped results, loop. An answer that ends with only `propose_flashcard` keeps its text and finishes without another request.
4. On a text answer: `checkAnswer` (below). If the answer quotes Scripture that no tool returned before it, or changes the words, and a request is left: the server fetches those verses (a `lookup_verses` shown in the UI), sends `reset`, and asks for **one** rewrite with the BSB text and no tools. If the rewrite fails, the draft is restored (`reset` with `text`) with its flags.
5. Send `citations` (verse links that stay unverified, plain references whose quotes were not checked), then `done`. Nothing fetched after the final answer is ever sent as a verified verse.
6. Provider failures become friendly `error` events (no credentials in the message). An abort ends the turn silently.

**Tools** (`tools/`, one file each; zod schema → JSON Schema, order fixed):

| Tool | Does | Emits |
|---|---|---|
| `search_flashcards(query, kind?, category?, limit)` | Keyword rank over published fact and discover cards (thresholded). With `DATABASE_URL`, the list itself is Postgres FTS | `flashcards` |
| `lookup_verses(references[])` | `parseReference`, then exact BSB text from `verses` (one query per call). At most 40 verses and 6 chapter spans per call, so "Genesis 1-50" returns the first 40 verses and says it was cut | `verses` |
| `search_bible(query, testament?, book?, limit)` | Full-text on `verses.search`: all terms first (`websearch_to_tsquery`), then any-term matches to fill the limit (max 10). Section headings come later (SEARCH.md §5) | `verses` |
| `propose_flashcard(draft)` | Check refs were fetched this turn; **saves nothing** | `flashcard_proposal` |

`read_passage` (a verse with context, a range, a section, or a chapter) is specified for Phase 2 and is not registered yet. Search strategy, indexes and the agent's search policy: [SEARCH.md](SEARCH.md). Tool lifecycle, `search_result` citations and the UI catalog: [HARNESS-UI.md](HARNESS-UI.md).

Each tool gets a `ToolContext` with the user id, translation, `emit()`, `versesSeen` (verse id → record) for the citation check, and the turn's abort `signal`.

**Verse source** (`src/lib/bible/bsb.ts`): with `DATABASE_URL` set, `lookupRanges` and `searchBibleText` query the `verses` table (31,086 BSB verses; the range join uses `verses_order_idx`). Without it (CI, a fresh clone) they fall back to `bible.helloao.org` with an 8 s timeout per chapter and 20 s for the search index; only successful loads are cached, and a failed index load is retried after a minute instead of failing until restart.

## Limits (`src/lib/agent/limits.ts`)

Every size and count lives in `LIMITS`, which client code and tests import too. Characters, not tokens (about 4 per English token).

| Group | What it caps |
|---|---|
| `client` | The browser sends the newest 12 turns, at most 16,000 characters (`trimHistory`) |
| `request` | `/api/chat` answers 400 only above 200 history items, 20,000 characters per item or 8,000 in the message; anything smaller is trimmed, never rejected |
| `model` | 8 history turns, 1,200 characters each, 6,000 in total; 4 earlier questions; 3 card lines of 280 characters; 32,000 characters per request; `max_tokens` 900 |
| `tools` | 40 verses and 6 chapter spans per lookup, 10 search hits, 5 card hits, 6,000 characters per tool result; helloao timeouts |
| `turn` | 4 model requests, 2 tool rounds, 8 verses for the corrective rewrite |
| `usage` | 20 turns per visitor per hour, 60 per UTC day; 800 model requests per UTC day for everyone (`SHOLAM_DAILY_MODEL_CALLS` overrides) |

## Usage limits (`usage-limit.ts`, `usage-store.ts`)

`/api/chat` counts each live turn in Postgres (`usage_counters`, shared by every Vercel instance) before it calls the model. The visitor is the signed-in user id, or an HMAC of the client IP (`x-vercel-forwarded-for`, then `x-real-ip`, then the first `x-forwarded-for` hop) keyed by `SHOLAM_RATE_LIMIT_SALT` or, if unset, another server secret. Raw IPs are never stored. Over a visitor limit, or once the global ceiling is reached, the route answers **429** with `{ error }` (a friendly sentence) and `Retry-After`; the browser shows the sentence. Each model request also increments the global counter, so a long tool loop counts in full. OpenRouter allows 1000 free requests a day to accounts that bought at least 10 credits (this one bought 15), so the default ceiling of 800 leaves room for local runs on the same key. Without `DATABASE_URL` the counters are per-process memory. If Postgres fails or the table is not migrated yet, the store switches to per-instance memory counters for 10 minutes (one warning), then tries Postgres again; if even that fails, the turn is let through (OpenRouter's own limit still applies). The harness ends every answered turn in one place, `finishTurn` in `harness.ts`, where the final text, its citation check, the verses fetched and the user id are all at hand. `rate-limit.ts` still paces retries after an OpenRouter 429 within one instance.

## Model route (`src/lib/agent/openrouter.ts`)

Chat calls OpenRouter's OpenAI-compatible chat completions. `OPENROUTER_API_KEY` selects the live guide; with no key, `/api/chat` streams the demo. `SHOLAM_MODEL` overrides the default `nvidia/nemotron-3-ultra-550b-a55b:free` with another `:free` id. `GET /api/health` reports the route, model id, agent mode and a database ping without secrets. `npm run model:smoke` sends one tiny chat completion.

## SSE protocol (`events.ts`)

One frame per event: `event: <type>\ndata: <json>\n\n`. The browser uses fetch + `ReadableStream` (EventSource cannot POST) and `SseDecoder`, which tolerates arbitrary chunk splits and drops unknown or malformed frames. `eventStream` pulls one event at a time; when the client goes away (Stop aborts the browser's fetch; closing the tab or leaving the chat does too) its `cancel()` aborts the turn's signal, which cancels the model request, tool fetches and retry waits.

| Event | Payload |
|---|---|
| `text_delta` | `text` |
| `tool_start` | `id`, `name`, `input` |
| `tool_result` | `id`, `name`, `ok`, `summary` |
| `verses` | `verses: { id, label, text, translation }[]` |
| `flashcards` | `cards: FlashcardSummary[]` |
| `flashcard_proposal` | `draft: FlashcardDraft` |
| `reset` | `reason` (`tool_call` \| `verse_check` \| `restore`), `text?`: replace the answer streamed so far with `text` (default empty) |
| `citations` | `unverified: { verseId, label, reason }[]`, `quoteWarnings: string[]`; sent once, before `done` |
| `done` | `stopReason`, `messageId?` |
| `error` | `message` |

## Citations (`citations.ts`)

The model cites as markdown links: `[John 3:16](verse:JHN.3.16)`. A citation is **verified** only when a tool returned that verse during the turn *before the answer was written*, and any words quoted for it match the returned BSB text. `checkAnswer` finds quotations (“…”, "…", `>` blocks; Latin script only, code ignored) and the reference right next to them (a `verse:` link or a plain "Romans 8:28"), then compares words, ignoring case, punctuation and apostrophe style, with `…` allowed between parts. Not fetched → `not_fetched`; fetched but different words → `quote_mismatch`. Quotes with no reference beside them, and non-English quotations, are not judged. The server sends the result as `citations`; `MessageList` renders `verse:` links with `VerseChip`: a chip with the verse text on hover when verified, otherwise the label marked "unverified" with the reason on hover, and a note under the answer for plain references whose quotes were not checked.

## Data model (`src/db/schema.ts`, migrations in `drizzle/`)

| Table | Key columns | RLS |
|---|---|---|
| `profiles` | `id` = `auth.users.id`, `display_name` | read/update own |
| `chats` | `user_id`, `title`, timestamps | owner only |
| `messages` | `chat_id`, `seq`, `role`, `content` jsonb (shape below, "Chat storage") | read via owned chat |
| `flashcards` | `kind` (`fact` \| `discover`), `slug` (seed key), `question`, `answer`, `explanation`, `takeaway` (discover), `category`, `tone`, `difficulty`, `refs` text[] (passage refs), `tags`, `minutes`, `section`, `source`, `author_id`, `status`, `search` tsvector (generated, GIN). Check `flashcards_fact_fields`: fact cards need answer, tone and difficulty | anyone reads `published`; authors insert/update own |
| `flashcard_reports` | `flashcard_id`, `user_id`, `reason` (one per user per card) | insert own |
| `verses` | PK (`translation`, `id`), `book`, `book_order`, `testament`, `chapter`, `verse`, `text`, `search` tsvector (generated, GIN) | public read |
| `usage_counters` | PK (`subject`, `period`), `count`, `updated_at`. `subject` is `global`, `u:<user id>` or `ip:<HMAC>`; `period` is `d:YYYY-MM-DD` or `h:YYYY-MM-DDTHH` (UTC). Rows older than 3 days are pruned | RLS on, no policies (server only) |

Until `DATABASE_URL` is set, flashcards come from `data/flashcards.seed.json` and BSB text is fetched/cached from helloao (see SOURCES.md). Signed-out chat threads are kept in the browser `sessionStorage`; signed-in chats are stored per account (see "Chat storage"). Either way the browser still resends text history with each turn.

The server queries through Drizzle as the database owner when configured, which **bypasses RLS**. Server code must scope chats and messages to the signed-in user itself.

## Auth

One flow for sign-in and sign-up (`src/components/shell/LoginForm.tsx`, steps in `src/lib/auth/login-state.ts`):

1. The person enters an email; `signInWithOtp` (`shouldCreateUser: true`, `emailRedirectTo: <origin>/auth/callback`) sends **one email with an 8-digit code and a link** (once the templates below are applied; until then Supabase's default email carries only its PKCE link, which returns to `/auth/callback?code=` and works in the browser that asked, as before).
2. **Code:** typed on the device that asked, `verifyOtp({ email, token, type: "email" })`. Works whichever browser or device the email is read on.
3. **Link:** the template's link is `{{ .RedirectTo }}?token_hash=…&type=email`, i.e. `/auth/callback?token_hash=…`, which `src/proxy.ts` forwards to `/auth/confirm`: a page with a "Sign in" button; the button posts to `/auth/verify`, which calls `verifyOtp({ token_hash, type })` on the server and sets the session cookies. Nothing is spent on GET, so mail scanners that open links can't use them up, and there is no PKCE verifier, so it works in any browser. A link that lands elsewhere (Supabase falls back to the site URL when a redirect is not allowed) is forwarded to `/auth/confirm` by `src/proxy.ts`.
4. New accounts (no `profiles.display_name`) get a name step (`PATCH /api/account`), then go to `next` (same-site paths only, `src/lib/auth/next-path.ts`).

Errors map to plain messages in `src/lib/auth/problems.ts`: code sent, wrong or expired code, link expired or already used, link opened in another browser (PKCE, `/auth/callback` only), the project's hourly email cap ("enter the code you already have"), the 60 s per-address gap (countdown), and the built-in mailer's team-only rule. `/auth/callback` (code exchange) stays for Google sign-in later and now reports Supabase's `error` / `error_code` parameters instead of redirecting as if it worked.

Signed-in state: `GET /api/account` (`{ enabled, account: { email, displayName }, canSave }`) feeds one client store, `useAccount()` (`src/lib/account/use-account.ts`): one request per page load, "loading" during the server render so hydration matches and the static shell reads no cookies. Desktop shows the account at the bottom of the sidebar (initial + name, a menu with the email and **Sign out**); phones show Jeff's chip top-right (`AccountButton.tsx`). Sign out is a same-origin `POST /auth/signout` (`signOut({ scope: "local" })`) and first clears the tab's chat history. Every state-changing route checks `Origin` / `Sec-Fetch-Site` (`src/lib/http.ts`), and JSON routes require `application/json`.

Supabase Auth settings (read 2026-11-14 through the Management API): site URL `https://sholam.vercel.app`; redirect allow-list `https://sholam.vercel.app/**`, `https://sholam-*-owenisas-projects.vercel.app/**` (previews) and `http://localhost:5310/**`; email confirmation on; code length 8, lifetime 3600 s; 60 s between emails to one address. The email templates must contain the code and the `/auth/confirm` link (below); until they do, emails carry only Supabase's default PKCE link.

| Template | Subject | Body (HTML) |
|---|---|---|
| Magic link (returning users) and Confirm signup (new users) | `Your Shalom sign-in code: {{ .Token }}` | The code in large type, then `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Sign in to Shalom</a>`, and a line that the code and link last an hour |

Status (2026-11-14):

| Piece | State |
|---|---|
| Supabase Auth: email provider on, sign-ups open, email confirmation required, site URL + redirect list | Done (read back from the Auth settings API) |
| `profiles` row per new user (`on_auth_user_created` trigger) | Done, migration `0001` applied |
| Code + link sign-in, confirm page, name step, error messages, sign-out | On main (2026-11-14), code entry hidden until the templates change. Code path checked against live Supabase with a wrong code (correct message); link path checked with a fake token (confirm page → POST → "expired or already used"). A real sign-in through today's default link is the next check (the built-in mailer only reaches team addresses) |
| Email templates with code and `/auth/confirm` link | Approved by the owner 2026-11-14 but **blocked**: Supabase refuses template edits on a free-tier project that uses the built-in mailer (`entitlement_required`). Apply them once custom SMTP is set up, and in the same change turn on `SIGN_IN_EMAIL_HAS_CODE` (`src/lib/auth/email.ts`). Until then the form asks for no code, and the email's default link signs in the browser that asked |
| Built-in Supabase mailer | **2 emails per hour for the whole project, and only to addresses in the project's team** (`email_address_not_authorized` otherwise). Custom SMTP needed before anyone outside the team can sign in |
| Signed-in state in the UI (sidebar account menu, phone header chip, sign-out) | Built (checked at 1280 and 375 px with stubbed account data) |
| Chats saved per user, history list, owner-only `/c/[chatId]` | Built: answered turns are saved through the harness's `onFinish`, saved chats open with their messages and citation marks. Checked by unit tests and the store against local Postgres; not yet with a real signed-in session |
| Google sign-in | Not configured (needs a Google OAuth client) |

## Chat storage (`src/lib/chat/store.ts`, `stored-content.ts`)

Signed-in chats live in `chats` / `messages`. The server connects as the owner, so every store function takes the signed-in user's id and every query filters on `chats.user_id` (tests check the SQL, and run the store against a real Postgres when `TEST_DATABASE_URL` is set). Ids are browser-made UUIDs; a write to an id owned by another account throws `ChatOwnershipError`.

- Saving: `/api/chat` passes `onFinish` to `runAgentTurn`; `finishTurn` in `harness.ts` (the one place an answered turn ends) calls it before `done` with the answer, the turn's verbatim messages, the verses fetched and the citation check, and the route writes the user row and the assistant row with `appendTurn`. Error and demo turns are not saved. A failed save is logged; the answer still streams. In the browser, `useChatStream` stops writing a signed-in chat to the tab, opens a saved chat from the rows `/c/[chatId]` loaded, and saves a tab chat's earlier messages (`/api/chats/import`) before continuing it signed in.
- `appendTurn(db, userId, chatId, rows)`: creates the chat on its first turn (title from the first user message), locks it, and appends rows after the highest `seq`. Nothing updates or deletes a message.
- `listChats` (newest first, with message counts) backs `GET /api/chats`; `loadChat` backs `GET /api/chats/[chatId]` and `/c/[chatId]`: `owned` (messages), `not-yours` (404 page), `missing` (a signed-out tab's chat, read from the tab).
- `importTabChats` backs `POST /api/chats/import`: on sign-in, the sidebar and phone panel offer to keep the tab's chats; chats already saved get only the messages after the ones they have.
- The sidebar and the phone Chats panel read `useChatList()`: signed out, the tab's history; signed in, the account's chats plus any tab chats not saved yet.

`messages.content` (version 1), one row per side of a turn:

| Role | Shape |
|---|---|
| `user` | `{ v: 1, text }`: what the person typed. The personalization note the server appends is rebuilt each turn, not stored |
| `assistant` | `{ v: 1, source: "openrouter" \| "demo" \| "tab-import", model?, turn, text, verses, citations?, cards?, proposal?, stopReason?, error? }`. `turn` holds the OpenAI-format messages the model produced that turn, verbatim and in order (assistant with `tool_calls`, `tool` results, final assistant); any `reasoning` / `reasoning_details` the provider returns stay on those messages. `text` is the answer shown. `verses` are the records tools returned that turn, the only verses the answer may cite: reloading renders citations against them, never against new lookups. `citations` is the final check (`unverified`, `quoteWarnings`), so a reloaded answer keeps its marks. `cards` / `proposal` are what the answer showed. Imported tab answers carry text only (`turn` empty, no verses), so their citations show as unverified |

## Bible references (`src/lib/bible/`)

`books.ts` holds the 66-book canon with USFM codes, names, chapter counts and aliases (`findBook` handles "1 Cor", "I John", "First John", "Ps"). Verse ids are `BOOK.chapter.verse`. `refs.ts` handles verse ids and passage refs (`MAT.18.21-MAT.18.35`, `DAN.4`, `GEN.1-GEN.2`), labels them ("Matthew 18:21–35"), and `parseReference` turns human references ("John 3:16-18", "1 Cor 13:4, 7", "Daniel 4", "John 12:1–8; Mark 14:3–9") into passage refs. `passageToVerseRanges` expands those into per-chapter spans for `lookupRanges` in `bsb.ts`. Verse bounds for stored cards are checked against `verses`, not in code.

## Data pipeline and environments

- **Connections:** the app uses `DATABASE_URL` (Supabase transaction pooler, port 6543, `prepare: false`); migrations and scripts use `DIRECT_URL` (session pooler, port 5432). Both are owner connections that bypass RLS.
- **Bible import** (`scripts/import-bible.ts`): download the pinned BSB USJ release into `tmp/` (gitignored) → check sha256 → `extractVerses` (`src/lib/bible/usj.ts`) per book → check chapter counts and spot verses → upsert 1,000 rows per batch in one transaction, keyed on (`translation`, `id`), so a rerun after a parser fix rewrites text in place.
- **Seed decks** (`scripts/seed-flashcards.ts`): zod-validate `data/flashcards.seed.json` (fact) and `data/faithmap.cards.json` (discover), resolve every passage ref (its first and last verse must exist in `verses`), upsert by `slug`.
- **FaithMap conversion** (`scripts/convert-faithmap.ts`): `data/sources/shalom_132_question_content_database.md` → `data/faithmap.cards.json`. Each `### FM001 | Question` entry: sections become categories, "Medium · Real Life, Curious · 3 min" becomes difficulty/tags/minutes, Primary then Supporting Scripture go through `parseReference`, and "Clear answer", "Why this passage matters" and "Key takeaway" become `answer`, `explanation` and `takeaway`; an entry missing any of them fails the run. A repeated question keeps its first write-up and the repeat is reported (FM130–FM132). Card ids come from the question text, so reseeding updates rows in place. Deterministic; the JSON is generated, not hand-edited.
- **Discover reveal** (`SwipeDeck.tsx`): "Show answer" turns a discover card over to its takeaway (headline), answer, passages and "Why this passage matters" in the back's scroll area; a discover card without an answer keeps "Where to start" and its passages. The agent gets the answer and "why" from `search_flashcards`, and the takeaway in its per-turn card note.
- **Flashcard reads** (`listFlashcards`): published cards; `q` matches `websearch_to_tsquery('english', q)` on the generated `search` column, or the question by `ILIKE` for partial words; ranked by `ts_rank_cd`. The live agent then keyword-ranks that list (`rankFlashcards`) before it mentions a card.
- **Flashcards page** (`/flashcards`, `src/lib/flashcards/deck.ts`): `getPublicDeck()` is `"use cache"` + `cacheLife("hours")` + `cacheTag("flashcards")` over `listFlashcards({ limit: 200 })`. It takes no arguments and reads no cookies, so one copy serves everyone and the page builds as static (○, revalidate 1 h, expire 1 d): Vercel's CDN serves the HTML with the cards in it, with no function or database call on the request. Hourly background revalidation picks up cards seeded by script; anything in the app that creates, hides or edits a card calls `revalidateDeck()` (`revalidateTag(tag, { expire: 0 })`). Nothing per-user may enter this cache. In the browser, `FlashcardsView` renders the deck under `use(browser())`: it shuffles once per mount with Fisher–Yates (`shuffled` in `shuffle.ts`), and `deckView` applies the kind filter and moves a chat-linked `?card=<id>` to the front without reshuffling. Until hydration `SwipeDeckPlaceholder` (the carousel's centred card, built from its own constants) holds the space, so nothing shifts (CLS 0). `?card` is read in its own Suspense boundary, because `useSearchParams` would otherwise pull the page out of the static shell.
- **Function region:** `vercel.json` pins functions to `sin1` (Singapore), the database's region. Vercel's default is `iad1` (Washington), which put two trans-Pacific legs on every query. Routing middleware (`src/proxy.ts`) runs in every region regardless.
- **Flashcards load, measured 2026-11-14** (before: deck streamed per request from `iad1`; after: static page). Postgres runs the list query in 0.6 ms; the rest was network. Production, curl: shell TTFB median 0.93 s, deck 0.8–2.6 s after it; headless Chrome: first card 2.4–12.6 s (median 5.1 s). Local `next start`: deck 1.0 s warm, 13 s on a cold connection, first card in Chrome 1.4 s. After, local: whole page in 4–8 ms, first card 178 ms (it waits only for hydration), HTML 148 → 132 KB (gzip 25.9 → 24.3 KB). After, production (`894d870`, `/flashcards` served as `x-vercel-cache: PRERENDER`, functions `pdx1::sin1`): curl TTFB median 931 → 306 ms, deck in the stream 2,026 → 620 ms (now just the download after the first byte); headless Chrome first card median 5.1 → 2.1 s (range 2.4–12.6 s → 0.99–4.5 s). Those runs were from a US West network where even `/icon.svg` took 0.5–1.4 s, so most of what remains is network plus loading the JS that hydrates the deck. JS is unchanged at ~255 KB gzip; `zod` reaches the client through `types.ts`. Steady client cost at phone size: the canvas sky (`CloudSky`) about 60 ms/s of main thread (213 ms/s at 4× CPU throttle); the WebGL card background about 28 ms/s more at 4×.
- **Migrations:** `drizzle/0000_init.sql` (tables, enums, RLS policies), `drizzle/0001_profiles_on_signup.sql` (`on_auth_user_created` trigger inserting a `profiles` row; `SECURITY DEFINER`, empty `search_path`), `drizzle/0002_discover_cards.sql` (card kinds and discover fields; hand-reordered because drizzle-kit re-added the generated `search` column before `section` existed and dropped its GIN index without recreating it; check generated SQL for this whenever a generated column changes), `drizzle/0003_usage_counters.sql` (the chat usage counters; generated as is). `drizzle/0004_discover_takeaway.sql` adds the nullable `flashcards.takeaway`; apply it before deploying code that reads it (`listFlashcards` selects every column).
- **Environments:** local (`.env.local`), Vercel Production (`main`) and Preview (pull requests) with the Supabase variables plus `OPENROUTER_API_KEY` for live chat, and CI with none. All share one Supabase project for now; a separate preview database is a Phase 5 question.
- **CI** (`.github/workflows/ci.yml`): `npm ci`, lint, typecheck, Vitest, seed `--check`, `next build` without secrets. Vercel builds and deploys independently through its Git integration.
