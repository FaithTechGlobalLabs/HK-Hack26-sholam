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

**Provider** (`openrouter.ts`): OpenAI-compatible `POST {OPENROUTER_BASE_URL}/chat/completions` with `Authorization: Bearer` from `OPENROUTER_API_KEY` (server only). Model from `SHOLAM_MODEL` (default `baidu/ernie-5.5-flash-preview:free`). Timeouts ~45s; one tool round then an answer (at most 3 completions); `temperature` 0.4; `max_tokens` 700. Free-model calls are spaced to stay under OpenRouter's ~20/minute cap, and a short 429 is retried. A daily free cap still fails with a message that names the reset rather than burning more requests.

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
| `search_flashcards(query, category?, limit)` | Keyword rank over published cards (thresholded) | `flashcards` |
| `lookup_verses(references[])` | Parse refs, fetch exact BSB text | `verses` |
| `search_bible(query, testament?, book?, limit)` | Keyword search over cached BSB | `verses` |
| `propose_flashcard(draft)` | Check refs seen this turn; **saves nothing** | `flashcard_proposal` |

Each tool gets a `ToolContext` with the user id, translation, `emit()` and `versesSeen` (verse id → record) for the citation check.

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

## Data model (`src/db/schema.ts`, migration `drizzle/0000_init.sql`)

| Table | Key columns | RLS |
|---|---|---|
| `profiles` | `id` = `auth.users.id`, `display_name` | read/update own |
| `chats` | `user_id`, `title`, timestamps | owner only |
| `messages` | `chat_id`, `seq`, `role`, `content` jsonb | read via owned chat |
| `flashcards` | `slug`, `question`, `answer`, … | anyone reads `published` |
| `flashcard_reports` | `flashcard_id`, `user_id`, `reason` | insert own |
| `verses` | PK (`translation`, `id`), text + FTS | public read |

Until `DATABASE_URL` is set, flashcards come from `data/flashcards.seed.json` and BSB text is fetched/cached from helloao (see SOURCES.md). Chat threads are kept in the browser `sessionStorage` and resent as text history with each turn.

The server queries through Drizzle as the database owner when configured, which **bypasses RLS**. Server code must scope chats and messages to the signed-in user itself.

## Auth

Supabase magic link. `src/proxy.ts` refreshes the session on page requests (`auth.getClaims()`); `src/lib/supabase/server.ts` gives Server Components and Route Handlers a client and `currentUserId()`. Reading flashcards needs no account; live chat works signed out with local history.

## Bible references (`src/lib/bible/`)

`books.ts` holds the 66-book canon with USFM codes, names, chapter counts and aliases. Verse ids are `BOOK.chapter.verse`. `refs.ts` validates ids and labels them; `parseReference` handles human references like "John 3:16-18". `bsb.ts` fetches and caches chapter text for tools.
