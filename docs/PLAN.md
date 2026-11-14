# sholam plan

Last updated: 2026-11-14

## Goal

A ChatGPT-style web app for the Bible and the Christian faith. ChatGPT's web app has a **Chat / Work** switch at the top of the page (Work launched 2026-07-09); sholam keeps **Chat** and puts **Flashcards** where Work would be.

- **Chat** is Shalom Guide: an OpenRouter agent that answers faith and Bible questions for young people, cites Berean Standard Bible text fetched from tools (not memory), searches the flashcard deck when a real match exists, and offers to draft a new card when none fits.
- **Flashcards** is a public deck of questions and answers: funny, surprising or interesting facts about the Bible, Jesus and God, each tied to verses.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-14 | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind 4, shadcn (base-nova), npm | Same family as other web apps in the workspace; route handlers stream SSE cleanly |
| 2026-11-14 | Supabase: Postgres + Auth + RLS; Drizzle ORM for schema and migrations | User chose Postgres; Supabase gives auth and row-level security in one place |
| 2026-11-14 | Chats are per user and private; all flashcards are public | User decision |
| 2026-11-14 | Claude via `@anthropic-ai/sdk`, default `claude-opus-5-5`, effort `medium`, model and base URL from env | Superseded the same day by OpenRouter (row below) |
| 2026-11-14 | OpenRouter chat completions, default `baidu/ernie-5.5-flash-preview:free`, model and base URL from env (`OPENROUTER_API_KEY`, `SHOLAM_MODEL`) | User chose OpenRouter; model stays configurable without code changes |
| 2026-11-14 | Manual streaming tool loop over OpenAI-compatible tool calls | The browser needs typed custom events (verse chips, card hits, proposals) |
| 2026-11-14 | Verse text from fetched BSB (helloao cache today; Postgres `verses` when imported), never model memory; uncited/unfetched verses shown as unverified | Citations have to be checkable |
| 2026-11-14 | Chat continuity via sessionStorage until Supabase chat persistence lands | No DATABASE_URL yet; Anthropic-shaped `messages.content` is not replayed for OpenRouter |
| 2026-11-14 | Answers lead with the point, usually 1–3 verses, `max_tokens` 700, temperature 0.4 | The first live answers read as essays; clarity over coverage |
| 2026-11-14 | Berean Standard Bible (BSB) as the default text | Public domain (CC0) since 2023-04-30, modern English; see SOURCES.md |
| 2026-11-14 | Doctrinal default: historic creedal Christianity, no denomination; differences described fairly | Fits "answer like a Christian, with peace" for a broad audience; open to revision below |
| 2026-11-14 | Agent proposes cards; only the user saves them | Public deck needs a human in the loop |

## Phases

### Phase 0: skeleton (done 2026-11-14)
Project structure, docs, `AGENTS.md` + `CLAUDE.md` symlink, app shell with Chat and Flashcards, SSE protocol and decoder, citation parsing, canon table, Drizzle schema with RLS and the initial migration (`drizzle/0000_init.sql`), tool definitions, system prompt draft, 10 checked seed cards, scripted demo stream. Typecheck, lint, 33 tests and a browser check pass.

### Phase 1: data
- Create the Supabase project (needs the owner's go-ahead: account and project creation).
- Apply `drizzle/0000_init.sql`; add a `profiles` row trigger on sign-up.
- `scripts/import-bible.ts`: BSB USJ release into `verses`, with counts and spot checks.
- `listFlashcards` on Postgres FTS; `seed-flashcards` upsert by slug; grow the seed deck to ~50 cards, each fact checked against the imported text.

### Phase 2: chat
- Magic-link sign-in; protect chat history routes in `src/proxy.ts`.
- `parseReference` and the four tools on the database.
- The streaming loop in `harness.ts` (see ARCHITECTURE.md), message persistence, chat titles, sidebar history and search.
- Server-side citation check before `done`; refusal and `max_tokens` handling; per-user rate limit.

### Phase 3: flashcards
- Save from the form and from chat proposals (refs checked against `verses`), report/flag, a small moderation view.
- Study mode scoring and resurfacing missed cards; random suggestion chips from the live deck.
- Design pass with `deslop-law` + `hallmark` across both modes.

### Phase 4: enrichment
- WEB as a second translation (keep the name only if the text is unchanged).
- OpenBible cross-references, after confirming the licence on the primary page.
- Easton's Bible Dictionary (public domain) and a `lookup_dictionary` tool.
- Public-domain quotations (e.g. Augustine, à Kempis, Spurgeon in PD editions) with a `search_quotes` tool, so the agent never quotes writers from memory.
- Semantic search with pgvector; embedding provider to be chosen.

### Phase 5: ship
Vercel + Supabase production, a citation-accuracy eval set (does every quoted verse match the database, are cites well-formed), cost and usage dashboard, abuse limits.

## Open questions

1. **Doctrinal stance wording.** The default is non-denominational creedal Christianity. Should sholam lean toward a tradition, or name one in settings?
2. **Card publishing.** Do user cards publish at once (flag to hide), or wait in a review queue?
3. **Second translation in the UI.** Offer a BSB/WEB toggle, or keep one text?
4. **Model and cost.** ERNIE 5.5 Flash Preview (free) via OpenRouter is the default. Revisit with real usage numbers in Phase 5.
