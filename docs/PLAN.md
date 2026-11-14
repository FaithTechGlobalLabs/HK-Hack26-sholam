# sholam plan

Last updated: 2026-11-14

## Goal

A ChatGPT-style web app for the Bible and the Christian faith. ChatGPT's web app has a **Chat / Work** switch at the top of the page (Work launched 2026-07-09); sholam keeps **Chat** and puts **Flashcards** where Work would be.

- **Chat** is a real agent harness. It answers questions the way a gentle, peaceful Christian would, cites Bible verses fetched from a database, searches the flashcard deck, and offers to draft a new card when none fits.
- **Flashcards** is a public deck of questions and answers: funny, surprising or interesting facts about the Bible, Jesus and God, each tied to verses.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-11-14 | Next.js 16 (App Router, Cache Components), TypeScript, Tailwind 4, shadcn (base-nova), npm | Same family as other web apps in the workspace; route handlers stream SSE cleanly |
| 2026-11-14 | Supabase: Postgres + Auth + RLS; Drizzle ORM for schema and migrations | User chose Postgres; Supabase gives auth and row-level security in one place |
| 2026-11-14 | Chats are per user and private; all flashcards are public | User decision |
| 2026-11-14 | Claude via `@anthropic-ai/sdk`, default `claude-opus-5-5`, effort `medium`, model and base URL from env | Current default model; base URL lets the local CLIProxyAPI/LiteLLM gateways stand in for a direct key |
| 2026-11-14 | Manual streaming tool loop, not the SDK's beta tool runner | The browser needs typed custom events (verse chips, card hits, proposals) |
| 2026-11-14 | Verse text from a database, never model memory; uncited/unfetched verses shown as unverified | Citations have to be checkable |
| 2026-11-14 | Berean Standard Bible (BSB) as the default text | Public domain (CC0) since 2023-04-30, modern English; see SOURCES.md |
| 2026-11-14 | Doctrinal default: historic creedal Christianity, no denomination; differences described fairly | Fits "answer like a Christian, with peace" for a broad audience; open to revision below |
| 2026-11-14 | Agent proposes cards; only the user saves them | Public deck needs a human in the loop |
| 2026-11-14 | Code in public repo `FaithTechGlobalLabs/HK-Hack26-sholam`, a submodule of Automation-agents | User decision; public so Vercel's Hobby plan can deploy it from an org |
| 2026-11-14 | Supabase project `sholam` (ref `cpeuhxozfhrldfbjbiwt`) in owenisas's Org, free plan, Singapore | Closest region to Hong Kong; user choice. Free projects pause after 7 days idle |
| 2026-11-14 | Vercel project `owenisas-projects/sholam` with the Git integration: `main` deploys production, PRs get previews | Repo is public, so Hobby can deploy it; no CI deploy token needed |
| 2026-11-14 | GitHub Actions CI runs lint, typecheck, tests, seed validation and a build without secrets | Keeps the no-env fallback path working; migrations stay a manual step |

## Phases

### Phase 0: skeleton (done 2026-11-14)
Project structure, docs, `AGENTS.md` + `CLAUDE.md` symlink, app shell with Chat and Flashcards, SSE protocol and decoder, citation parsing, canon table, Drizzle schema with RLS and the initial migration (`drizzle/0000_init.sql`), tool definitions, system prompt draft, 10 checked seed cards, scripted demo stream. Typecheck, lint, 33 tests and a browser check pass.

### Phase 1: data and deploy (done 2026-11-14)
- Supabase project created; migrations `0000_init` and `0001_profiles_on_signup` (profile row per new auth user) applied. RLS checked from the public key: cards and verses readable, chats empty, anonymous insert refused (401).
- `scripts/import-bible.ts`: pinned BSB v5.19 USJ (sha256 checked) → 31,086 verses in 1,189 chapters. The extractor handles five source quirks (see SOURCES.md); 305 of 306 random verses match the helloao.org BSB text exactly, the last differs only in `…` vs `...`.
- `listFlashcards` on Postgres FTS (`websearch_to_tsquery` plus partial-word match); `seed-flashcards` upserts by slug after checking every ref exists in `verses`.
- Seed deck grown to 50 cards; each answer and quotation checked against the imported verse text.
- CI workflow (`.github/workflows/ci.yml`) and the Vercel project with the Git integration and Supabase env vars.

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
4. **Model and cost.** Opus 5.5 at medium effort is the default. Revisit with real usage numbers in Phase 5.
