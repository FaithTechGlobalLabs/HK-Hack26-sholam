# sholam architecture

Last updated: 2026-11-14

## Shape

```
Browser (React client components)
  ChatView ── POST /api/chat ──────────────► route handler ──► harness.runAgentTurn
     ▲            (SSE: AgentEvent frames)                     │  OpenRouter chat completions (stream)
     └── SseDecoder ◄──────────────────────────────────────────┤  tools ──► BSB (helloao) + seed deck
  FlashcardsView ── GET/POST /api/flashcards ──► repo ─────────┘
  LoginForm ── Supabase Auth (magic link) ──► /auth/callback
src/proxy.ts refreshes the Supabase session cookie on page requests.
```

Without env vars the app still runs: `/api/chat` streams `lib/agent/demo.ts`, and flashcards come from `data/flashcards.seed.json`. With `OPENROUTER_API_KEY` set (and `SHOLAM_AGENT` not `demo`), Chat runs Shalom Guide live.

## Agent harness (`src/lib/agent/`)

**Why a manual loop:** we need our own event stream to the browser (verse records, card hits, proposals) alongside text, so we drive OpenRouter streaming ourselves.

**Provider** (`openrouter.ts`): OpenAI-compatible `POST {OPENROUTER_BASE_URL}/chat/completions` with `Authorization: Bearer` from `OPENROUTER_API_KEY` (server only). Model from `SHOLAM_MODEL`, free `:free` ids only (default `nvidia/nemotron-3-ultra-550b-a55b:free`; any other id falls back to it). Reasoning is `effort: low` and excluded from the reply; any leaked `<think>` text is stripped. Providers are sorted by latency under a price cap, so a cheap slow host is not preferred. The answer streams in one completion; verse text for citations is loaded after, without a second model call. Timeouts ~45s; `temperature` 0.4; `max_tokens` 900. Free models are spaced under OpenRouter's ~20/minute cap and share its daily free cap.

**Request** (`buildMessages` in `harness.ts`): stable `SYSTEM_PROMPT`, prior user/assistant text turns from the browser, then the new user message plus a trailing personalization note (earlier questions + strong flashcard matches). Tools stay a fixed ordered list from zod schemas.

**Loop**, per user turn:

1. Build messages; stream one completion.
2. Forward text deltas as `text_delta`.
3. On `tool_calls`: validate each input with its zod schema; run tools; emit `tool_start` / `tool_result` (and `verses` / `flashcards` / `flashcard_proposal` from tools); append tool results; loop.
4. On a plain text finish: citation check against `versesSeen`, emit `done`.
5. Stop after `maxSteps` with an `error` event. Provider failures become friendly `error` events (no credentials in the message).

**Tools** (`tools/`, one file each; zod schema → JSON Schema, order fixed):

| Tool | Does | Emits |
|---|---|---|
| `search_flashcards(query, kind?, category?, limit)` | Keyword rank over published fact and discover cards (thresholded). With `DATABASE_URL`, the list itself is Postgres FTS | `flashcards` |
| `lookup_verses(references[])` | `parseReference`, then fetch exact BSB text (helloao cache today; `verses` in Phase 2) | `verses` |
| `search_bible(query, testament?, book?, limit)` | Keyword search over the cached BSB. Phase 2 moves this to verse full-text + section headings (SEARCH.md §5) | `verses` |
| `propose_flashcard(draft)` | Check refs were fetched this turn; **saves nothing** | `flashcard_proposal` |

`read_passage` (a verse with context, a range, a section, or a chapter) is specified for Phase 2 and is not registered yet. Search strategy, indexes and the agent's search policy: [SEARCH.md](SEARCH.md). Tool lifecycle, `search_result` citations and the UI catalog: [HARNESS-UI.md](HARNESS-UI.md).

Each tool gets a `ToolContext` with the user id, translation, `emit()` and `versesSeen` (verse id → record) for the citation check.

## Model route (`src/lib/agent/openrouter.ts`)

Chat calls OpenRouter's OpenAI-compatible chat completions. `OPENROUTER_API_KEY` selects the live guide; with no key, `/api/chat` streams the demo. `SHOLAM_MODEL` overrides the default `nvidia/nemotron-3-ultra-550b-a55b:free` with another `:free` id. `GET /api/health` reports the route, model id, agent mode and a database ping without secrets. `npm run model:smoke` sends one tiny chat completion.

## SSE protocol (`events.ts`)

One frame per event: `event: <type>\ndata: <json>\n\n`. The browser uses fetch + `ReadableStream` (EventSource cannot POST) and `SseDecoder`, which tolerates arbitrary chunk splits and drops unknown or malformed frames.

| Event | Payload |
|---|---|
| `text_delta` | `text` |
| `tool_start` | `id`, `name`, `input` |
| `tool_result` | `id`, `name`, `ok`, `summary` |
| `verses` | `verses: { id, label, text, translation }[]` |
| `flashcards` | `cards: FlashcardSummary[]` |
| `flashcard_proposal` | `draft: FlashcardDraft` |
| `done` | `stopReason`, `messageId?` |
| `error` | `message` |

## Citations (`citations.ts`)

The model cites as markdown links: `[John 3:16](verse:JHN.3.16)`. A citation is **verified** when its verse id is in `versesSeen` for the turn. `MessageList` lets `verse:` URLs through react-markdown's URL filter and renders them with `VerseChip`: verified cites become chips with the verse text on hover and feed the Sources panel; others show the label with an "unverified" mark.

## Data model (`src/db/schema.ts`, migrations in `drizzle/`)

| Table | Key columns | RLS |
|---|---|---|
| `profiles` | `id` = `auth.users.id`, `display_name` | read/update own |
| `chats` | `user_id`, `title`, timestamps | owner only |
| `messages` | `chat_id`, `seq`, `role`, `content` jsonb (verbatim blocks) | read via owned chat |
| `flashcards` | `kind` (`fact` \| `discover`), `slug` (seed key), `question`, `answer`, `explanation`, `category`, `tone`, `difficulty`, `refs` text[] (passage refs), `tags`, `minutes`, `section`, `source`, `author_id`, `status`, `search` tsvector (generated, GIN). Check `flashcards_fact_fields`: fact cards need answer, tone and difficulty | anyone reads `published`; authors insert/update own |
| `flashcard_reports` | `flashcard_id`, `user_id`, `reason` (one per user per card) | insert own |
| `verses` | PK (`translation`, `id`), `book`, `book_order`, `testament`, `chapter`, `verse`, `text`, `search` tsvector (generated, GIN) | public read |

Until `DATABASE_URL` is set, flashcards come from `data/flashcards.seed.json` and BSB text is fetched/cached from helloao (see SOURCES.md). Chat threads are kept in the browser `sessionStorage` and resent as text history with each turn.

The server queries through Drizzle as the database owner when configured, which **bypasses RLS**. Server code must scope chats and messages to the signed-in user itself.

## Auth

Supabase magic link. `src/proxy.ts` refreshes the session on page requests (`auth.getClaims()`); `src/lib/supabase/server.ts` gives Server Components and Route Handlers a client and `currentUserId()`. Reading flashcards needs no account; live chat works signed out with local history.

Supabase Auth settings (set 2026-11-14 through the Management API): site URL `https://sholam.vercel.app`; redirect allow-list `https://sholam.vercel.app/**`, `https://sholam-*-owenisas-projects.vercel.app/**` (previews) and `http://localhost:5310/**`. The magic link returns to `/auth/callback`. Supabase's built-in mailer is rate-limited on the free plan; a custom SMTP sender is a Phase 5 item.

Status (2026-11-14):

| Piece | State |
|---|---|
| Supabase Auth: email provider on, sign-ups open, email confirmation required, site URL + redirect list | Done (read back from the Auth settings API) |
| `profiles` row per new user (`on_auth_user_created` trigger) | Done, migration `0001` applied |
| `/login` magic-link form, `/auth/callback` code exchange, `src/proxy.ts` session refresh, `currentUserId()` | Written; **not yet tested end to end** (no real sign-in has been done) |
| Built-in Supabase mailer | Works but limited to **2 emails per hour** for the whole project; enough to test, not to launch. Custom SMTP (e.g. Resend) before real users |
| Signed-in state in the UI (the sidebar and the dock still always say "Sign in"; no account menu or sign-out) | Not started (Phase 2) |
| Chats saved per user, history list, protected routes | Not started (Phase 2, with the agent loop) |
| Google sign-in | Not configured (needs a Google OAuth client) |

## Bible references (`src/lib/bible/`)

`books.ts` holds the 66-book canon with USFM codes, names, chapter counts and aliases (`findBook` handles "1 Cor", "I John", "First John", "Ps"). Verse ids are `BOOK.chapter.verse`. `refs.ts` handles verse ids and passage refs (`MAT.18.21-MAT.18.35`, `DAN.4`, `GEN.1-GEN.2`), labels them ("Matthew 18:21–35"), and `parseReference` turns human references ("John 3:16-18", "1 Cor 13:4, 7", "Daniel 4", "John 12:1–8; Mark 14:3–9") into passage refs. `passageToVerseRanges` expands those into per-chapter spans for the helloao fetcher in `bsb.ts`. Verse bounds for stored cards are checked against `verses`, not in code.

## Data pipeline and environments

- **Connections:** the app uses `DATABASE_URL` (Supabase transaction pooler, port 6543, `prepare: false`); migrations and scripts use `DIRECT_URL` (session pooler, port 5432). Both are owner connections that bypass RLS.
- **Bible import** (`scripts/import-bible.ts`): download the pinned BSB USJ release into `tmp/` (gitignored) → check sha256 → `extractVerses` (`src/lib/bible/usj.ts`) per book → check chapter counts and spot verses → upsert 1,000 rows per batch in one transaction, keyed on (`translation`, `id`), so a rerun after a parser fix rewrites text in place.
- **Seed decks** (`scripts/seed-flashcards.ts`): zod-validate `data/flashcards.seed.json` (fact) and `data/faithmap.cards.json` (discover), resolve every passage ref (its first and last verse must exist in `verses`), upsert by `slug`.
- **FaithMap conversion** (`scripts/convert-faithmap.ts`): `data/sources/faithmap_132_curated_questions.md` → `data/faithmap.cards.json`. Sections become categories, "Medium · Real Life, Curious · 3 min" becomes difficulty/tags/minutes, Scripture lines go through `parseReference`, exact repeats are skipped and reported. Deterministic; the JSON is generated, not hand-edited.
- **Flashcard reads** (`listFlashcards`): published cards; `q` matches `websearch_to_tsquery('english', q)` on the generated `search` column, or the question by `ILIKE` for partial words; ranked by `ts_rank_cd`. The live agent then keyword-ranks that list (`rankFlashcards`) before it mentions a card.
- **Migrations:** `drizzle/0000_init.sql` (tables, enums, RLS policies), `drizzle/0001_profiles_on_signup.sql` (`on_auth_user_created` trigger inserting a `profiles` row; `SECURITY DEFINER`, empty `search_path`), `drizzle/0002_discover_cards.sql` (card kinds and discover fields; hand-reordered because drizzle-kit re-added the generated `search` column before `section` existed and dropped its GIN index without recreating it; check generated SQL for this whenever a generated column changes).
- **Environments:** local (`.env.local`), Vercel Production (`main`) and Preview (pull requests) with the Supabase variables plus `OPENROUTER_API_KEY` for live chat, and CI with none. All share one Supabase project for now; a separate preview database is a Phase 5 question.
- **CI** (`.github/workflows/ci.yml`): `npm ci`, lint, typecheck, Vitest, seed `--check`, `next build` without secrets. Vercel builds and deploys independently through its Git integration.
