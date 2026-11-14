# sholam architecture

Last updated: 2026-11-14

## Shape

```
Browser (React client components)
  ChatView ── POST /api/chat ──────────────► route handler ──► harness.runAgentTurn
     ▲            (SSE: AgentEvent frames)                     │  Anthropic Messages API (stream)
     └── SseDecoder ◄──────────────────────────────────────────┤  tools ──► Postgres (Drizzle)
  FlashcardsView ── GET/POST /api/flashcards ──► repo ─────────┘
  LoginForm ── Supabase Auth (magic link) ──► /auth/callback
src/proxy.ts refreshes the Supabase session cookie on page requests.
```

Without env vars the app still runs: `/api/chat` streams `lib/agent/demo.ts`, and flashcards come from `data/flashcards.seed.json`.

## Agent harness (`src/lib/agent/`)

**Why a manual loop:** we need our own event stream to the browser (verse records, card hits, proposals) alongside text, so we drive `client.messages.stream()` ourselves rather than use the SDK's beta tool runner.

**Request** (`buildRequest` in `harness.ts`): `model` from `SHOLAM_MODEL` (default `claude-opus-5-5`), `output_config.effort` from `SHOLAM_EFFORT` (default `medium`), `max_tokens` 16000, the four tools, and the system prompt as one text block with `cache_control: ephemeral`. Thinking stays at the model default (adaptive; Opus 5.5 does not allow turning it off). Render order is tools → system → messages, so the cached prefix covers both tools and prompt; neither may contain per-request values. With `SHOLAM_FALLBACKS=default`, Phase 2 sends through `client.beta.messages.stream` with beta `server-side-fallback-2026-07-01` and `fallbacks: "default"` (direct Anthropic API only).

**Loop** (Phase 2), per user turn:

1. Load the chat's stored messages (verbatim content blocks) and append the user message.
2. Stream a step; forward text deltas as `text_delta`.
3. `finalMessage()`; persist `message.content` unchanged (thinking blocks included: Opus 5.5 checks replayed history, so history is append-only).
4. On `stop_reason`:
   - `tool_use`: validate each input with its zod schema; run tools in parallel; emit `tool_start` / `tool_result`; append **all** `tool_result` blocks in **one** user message (`is_error: true` on failure); go to 2.
   - `pause_turn`: append the assistant content and go to 2.
   - `end_turn`: run the citation check, emit `done`.
   - `max_tokens` / `refusal`: emit `done` with that reason; never run tools from a truncated or refused turn.
5. Stop after 8 tool rounds with an `error` event.

**Tools** (`tools/`, one file each; zod schema → JSON Schema via `z.toJSONSchema`, order fixed):

| Tool | Does | Emits |
|---|---|---|
| `search_flashcards(query, category?, limit)` | FTS over published cards | `flashcards` |
| `lookup_verses(references[])` | Parse refs, fetch exact text | `verses` |
| `search_bible(query, testament?, book?, limit)` | FTS over verses | `verses` |
| `propose_flashcard(draft)` | Check refs exist; **saves nothing** | `flashcard_proposal` |

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

The model cites as markdown links: `[John 3:16](verse:JHN.3.16)`. A citation is **verified** when its verse id is in `versesSeen` for the turn. `MessageList` lets `verse:` URLs through react-markdown's URL filter and renders them with `VerseChip`: verified cites become chips with the verse text on hover and feed the Sources panel; others show the label with an "unverified" mark. Phase 2 adds a server-side count of unverified cites to the `done` event for logging and evals.

## Data model (`src/db/schema.ts`, migration `drizzle/0000_init.sql`)

| Table | Key columns | RLS |
|---|---|---|
| `profiles` | `id` = `auth.users.id`, `display_name` | read/update own |
| `chats` | `user_id`, `title`, timestamps | owner only |
| `messages` | `chat_id`, `seq`, `role`, `content` jsonb (verbatim blocks) | read via owned chat |
| `flashcards` | `slug` (seed key), `question`, `answer`, `explanation`, `category`, `tone`, `difficulty`, `refs` text[], `author_id`, `status`, `search` tsvector (generated, GIN) | anyone reads `published`; authors insert/update own |
| `flashcard_reports` | `flashcard_id`, `user_id`, `reason` (one per user per card) | insert own |
| `verses` | PK (`translation`, `id`), `book`, `book_order`, `testament`, `chapter`, `verse`, `text`, `search` tsvector (generated, GIN) | public read |

The server queries through Drizzle as the database owner, which **bypasses RLS**. Server code must scope chats and messages to the signed-in user itself; RLS protects anything reached with supabase-js from the browser.

## Auth

Supabase magic link. `src/proxy.ts` refreshes the session on page requests (`auth.getClaims()`); `src/lib/supabase/server.ts` gives Server Components and Route Handlers a client and `currentUserId()`. Reading flashcards needs no account; chats need one (Phase 2).

## Bible references (`src/lib/bible/`)

`books.ts` holds the 66-book canon with USFM codes, names, chapter counts and aliases (`findBook` handles "1 Cor", "I John", "First John", "Ps"). Verse ids are `BOOK.chapter.verse`. `refs.ts` validates ids and labels them; `parseReference` (human references like "John 3:16-18") is a Phase 2 stub with todo tests.
