<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# sholam: agent rules

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

sholam is a ChatGPT-style web app with two modes: **Chat** (a Claude agent that answers Bible and faith questions gently, citing verses from a database) and **Flashcards** (a public deck of Bible Q&A cards). Read `docs/PLAN.md` for scope and phase, `docs/ARCHITECTURE.md` for how it fits together, and `docs/SOURCES.md` before touching any Bible or reference data.

## Commands

Run from `sholam/`. npm only (the parent repo ignores other lockfiles).

| Task | Command |
|---|---|
| Dev server (port 5310) | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Lint + format check | `npm run lint` (Biome; `npx biome check --write .` to fix) |
| Unit tests | `npm test` (Vitest, `tests/`) |
| Migration from schema | `npm run db:generate` (writes `drizzle/`) |
| Apply migrations | `npm run db:migrate` (needs `DATABASE_URL`) |
| Validate seed cards | `npm run seed:flashcards` |

Before you call work done: typecheck, lint and tests pass, and UI changes are checked in the browser (the `sholam` entry in the workspace `.claude/launch.json`).

## Stack facts that trip agents up

- Next.js 16 with **Cache Components** on. Server components that read runtime data (`params`, `searchParams`, `cookies()`, DB queries) must sit under `<Suspense>`, or use `"use cache"` + `cacheLife`. Middleware is `src/proxy.ts` (renamed in 16).
- Supabase keys are `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not the old anon key). Session refresh uses `auth.getClaims()`.
- Drizzle uses `casing: "snake_case"` in both `drizzle.config.ts` and `src/db/index.ts`; keep them in step. The server connects as the DB owner and **bypasses RLS**: every chat/message query must filter by the signed-in user.
- shadcn `base-nova` style on Base UI; `cn` comes from the `cn` package (shadcn's own), re-exported by `src/lib/utils.ts`.
- Everything must run with no env vars set: Supabase helpers return null, flashcards fall back to `data/flashcards.seed.json`, `/api/chat` streams the scripted demo unless `SHOLAM_AGENT=live`.

## Non-negotiable product rules

1. **Scripture comes from data, never model memory.** The agent quotes only verse text a tool returned this turn. Citations are `[Label](verse:BOOK.c.v)` links; the server and UI treat any cite not fetched this turn as unverified. Do not weaken this to make answers look better.
2. **Verse ids** are `BOOK.chapter.verse` with USFM book codes (`JHN.3.16`, `1CO.13.4`). `src/lib/bible/books.ts` is the canon table.
3. **The agent never saves a flashcard.** `propose_flashcard` only emits a draft; the user saves it via `POST /api/flashcards`.
4. **Flashcards are public; chats are private.** Cards carry `author_id` and a `status` so they can be flagged and hidden.
5. **Tone:** gentle, peaceful, non-denominational historic Christianity; differences between traditions are described fairly. The prompt is `src/lib/agent/system-prompt.ts`. Changing its doctrinal stance is a product decision: record it in `docs/PLAN.md`.
6. **Prompt caching:** tools and system prompt stay byte-stable (no dates, ids or user data in them; fixed tool order).
7. **Chat history is append-only.** Store the model's content blocks verbatim (`messages.content`), thinking blocks included; never edit or reorder past turns.
8. **Licensing:** only add texts whose licence is recorded in `docs/SOURCES.md`. No API.Bible content, no KJV for UK users.

## Layout

```
src/app/(shell)/        Chat (/ and /c/[chatId]) and Flashcards (/flashcards) inside the app shell
src/app/api/            chat (SSE), flashcards (GET list, POST create)
src/components/shell/   AppShell, Sidebar, ModeToggle, ChatView, Composer, MessageList, VerseChip, SourcesPanel
src/components/flashcards/  FlashcardsView, FlashcardCard, StudyMode, NewCardDialog, FlashcardProposal
src/lib/agent/          harness (loop), events (SSE protocol), citations, system-prompt, tools/, demo
src/lib/bible/          books (canon table), refs (verse ids, reference parser)
src/lib/flashcards/     types (zod schema), repo (DB or seed)
src/db/                 Drizzle schema + RLS policies, client
scripts/                import-bible (BSB), seed-flashcards
data/                   flashcards.seed.json
drizzle/                generated migrations (do not hand-edit)
```

## UI work

Before designing or restyling any screen, load the `deslop-law` and `hallmark` skills and check the result against them. The current UI is a neutral skeleton, not a design.

## Docs

One canonical doc per topic, updated in place with `Last updated: YYYY-MM-DD`: plan and decisions in `docs/PLAN.md`, system design in `docs/ARCHITECTURE.md`, data provenance in `docs/SOURCES.md`, setup in `README.md`. Do not add status logs here.
