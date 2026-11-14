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
| 2026-11-14 | OpenRouter chat completions, default `baidu/ernie-5.5-flash-preview:free`, model and base URL from env (`OPENROUTER_API_KEY`, `SHOLAM_MODEL`) | Superseded the same day by Nemotron (row below) |
| 2026-11-14 | Default model `nvidia/nemotron-3-ultra-550b-a55b:free` only; reasoning off; no paid fallback | Superseded the same day by DeepSeek (row below) |
| 2026-11-14 | Default model `deepseek/deepseek-v4.1-flash`; reasoning off; providers sorted by price | User asked to leave the free-model quota. This id is paid and cheap |
| 2026-11-14 | Manual streaming tool loop over OpenAI-compatible tool calls | The browser needs typed custom events (verse chips, card hits, proposals) |
| 2026-11-14 | Verse text from fetched BSB (helloao cache today; Postgres `verses` when imported), never model memory; uncited/unfetched verses shown as unverified | Citations have to be checkable |
| 2026-11-14 | Chat continuity via sessionStorage until Supabase chat persistence lands | No DATABASE_URL yet; Anthropic-shaped `messages.content` is not replayed for OpenRouter |
| 2026-11-14 | Answers lead with the point, usually 1–3 verses, `max_tokens` 700, temperature 0.4 | The first live answers read as essays; clarity over coverage |
| 2026-11-14 | Berean Standard Bible (BSB) as the default text | Public domain (CC0) since 2023-04-30, modern English; see SOURCES.md |
| 2026-11-14 | Doctrinal default: historic creedal Christianity, no denomination; differences described fairly | Fits "answer like a Christian, with peace" for a broad audience; open to revision below |
| 2026-11-14 | Agent proposes cards; only the user saves them | Public deck needs a human in the loop |
| 2026-11-14 | Code in public repo `FaithTechGlobalLabs/HK-Hack26-sholam`, a submodule of Automation-agents | User decision; public so Vercel's Hobby plan can deploy it from an org |
| 2026-11-14 | Supabase project `sholam` (ref `cpeuhxozfhrldfbjbiwt`) in owenisas's Org, free plan, Singapore | Closest region to Hong Kong; user choice. Free projects pause after 7 days idle |
| 2026-11-14 | Vercel project `owenisas-projects/sholam` with the Git integration: `main` deploys production, PRs get previews | Repo is public, so Hobby can deploy it; no CI deploy token needed |
| 2026-11-14 | GitHub Actions CI runs lint, typecheck, tests, seed validation and a build without secrets | Keeps the no-env fallback path working; migrations stay a manual step |
| 2026-11-14 | Agentic search over several small indexes (verses, section headings; later embeddings, Strong's, cross-references), with tool results as the only quotable source | Baseline on our data: verse full-text 12/25, headings 17/25, both 24/25. Design in [SEARCH.md](SEARCH.md) |
| 2026-11-14 | Two card kinds in one deck: `fact` (question + answer + verses) and `discover` (open question + Scripture starting points, no answer) | The team's FaithMap set is open questions for ages ~13–20; its editorial note says references are starting points, not proof, so no answers were invented |
| 2026-11-14 | Harness and agent-UI direction from [HARNESS-UI.md](HARNESS-UI.md): closed component catalog, two channels per tool, `search_result` citations, `ask_user`, more card kinds | Research session; open questions listed there |
| 2026-11-14 | Live chat stays OpenRouter chat completions in `src/lib/agent/openrouter.ts` (ERNIE flash default). A same-day proposal to call OpenRouter through the Anthropic SDK (`anthropic/claude-opus-5.5`) is not wired | One route only, so `/api/health` and `npm run model:smoke` match what `/api/chat` calls |
| 2026-11-14 | Flashcard UI/UX and the visual theme are owned by teammates (docs/TEAM.md) | Parallel work; the current flashcard UI on `main` is a functional skeleton they will replace |
| 2026-11-14 | The left sidebar and header mode switch are replaced by a bottom dock (React Bits): New chat, Flashcards, Sign in | Ricky, PR #2. Chat history still needs a home in Phase 2 |
| 2026-11-14 | Flashcards show one card at a time: tap to reveal, swipe left for the next, hold to send the card to chat | Ricky, PR #2. Works for both card kinds: discover cards reveal their starting points |
| 2026-11-14 | Animated cloud sky with a cross-shaped cloud and blue glass UI | Jeff, PR #1 (merged through PR #2) |
| 2026-11-14 | Logo: a cross drawn as a cloud (billows on its sunlit top edges), bare mark + lowercase wordmark top-left like ChatGPT; favicon blue on light tabs, near-white on dark; iOS icon on the app's sky | Grows out of the sky's cross cloud, so the brand and the theme are one idea. The wordmark uses the UI font for now; custom lettering is a later polish |
| 2026-11-14 | Chat history lives in a Chats panel opened from the dock; the UI name is one constant (`BRAND_NAME`) | Combining MustyDusty's sidebar history with PR #2's dock. The name ("Shalom" on main, "sholam" for the repo) is for the team to confirm |
| 2026-11-14 | Chat never sends from a URL; questions from other views use a one-shot same-origin hand-off; the site cannot be framed | Engineering review of PR #2: `?send=1` let any link or hidden iframe spend the OpenRouter key |

## In flight

Teammate work and branch status are tracked in [TEAM.md](TEAM.md). When a branch changes a product decision, it adds a row above and updates AGENTS.md's layout and ARCHITECTURE.md in the same PR.


## Phases

### Phase 0: skeleton (done 2026-11-14)
Project structure, docs, `AGENTS.md` + `CLAUDE.md` symlink, app shell with Chat and Flashcards, SSE protocol and decoder, citation parsing, canon table, Drizzle schema with RLS and the initial migration (`drizzle/0000_init.sql`), tool definitions, system prompt draft, 10 checked seed cards, scripted demo stream. Typecheck, lint, 33 tests and a browser check pass.

### Phase 1: data and deploy (done 2026-11-14)
- Supabase project created; migrations `0000_init` and `0001_profiles_on_signup` (profile row per new auth user) applied. RLS checked from the public key: cards and verses readable, chats empty, anonymous insert refused (401).
- `scripts/import-bible.ts`: pinned BSB v5.19 USJ (sha256 checked) → 31,086 verses in 1,189 chapters. The extractor handles five source quirks (see SOURCES.md); 305 of 306 random verses match the helloao.org BSB text exactly, the last differs only in `…` vs `...`.
- `listFlashcards` on Postgres FTS (`websearch_to_tsquery` plus partial-word match); `seed-flashcards` upserts by slug after checking every ref exists in `verses`.
- Seed deck grown to 50 cards; each answer and quotation checked against the imported verse text.
- CI workflow (`.github/workflows/ci.yml`) and the Vercel project with the Git integration and Supabase env vars.
- Follow-up the same day: FaithMap import. Migration `0002_discover_cards` adds `kind`, `tags`, `minutes`, `section`, `source` (answer, tone and difficulty optional for discover cards, enforced by a check). `parseReference` implemented (verses, ranges, chapters, lists). `npm run faithmap:convert` turns the source markdown into 129 discover cards (3 exact repeats skipped); all references resolve in `verses`. The Flashcards page filters by kind and topic. Deck: 50 fact + 129 discover.

### Phase 2: chat
The OpenRouter streaming loop is already in `harness.ts` (helloao text, keyword card ranking, browser history). Still open:

- Magic-link sign-in; protect chat history routes in `src/proxy.ts`.
- Search per SEARCH.md §8: `verses.pos`, a `sections` table from the importer, `search_bible` (verses + headings + any-term fallback), `read_passage`, `lookup_verses` on `parseReference`, the search policy in the prompt, and the eval on the real loop.
- `search_flashcards` and `propose_flashcard` on the database; discover cards open in chat with their starting points.
- The streaming loop in `harness.ts` (see ARCHITECTURE.md), message persistence, chat titles, history and search. History no longer has a sidebar; it needs a home that fits the dock.
- Server-side citation check before `done`; refusal and `max_tokens` handling; per-user rate limit.

### Phase 3: flashcards and semantic search
- Hybrid semantic search (pgvector embeddings fused with full-text by RRF) once the Phase 2 eval is in; embedding provider to be chosen.
- Save from the form and from chat proposals (refs checked against `verses`), report/flag, a small moderation view.
- Study mode scoring and resurfacing missed cards; random suggestion chips from the live deck.
- Design pass with `deslop-law` + `hallmark` across both modes.

### Phase 4: enrichment
- WEB as a second translation (keep the name only if the text is unchanged).
- Cross-references: OpenBible (CC BY 4.0, confirmed 2026-11-14; needs attribution) or TSK (public domain).
- Strong's word studies, after the per-file licence check (SOURCES.md).
- Easton's Bible Dictionary (public domain) and a `lookup_dictionary` tool.
- Public-domain quotations (e.g. Augustine, à Kempis, Spurgeon in PD editions) with a `search_quotes` tool, so the agent never quotes writers from memory.
- Topical index (OpenBible topics) and typo-tolerant name search.

### Phase 5: ship
Vercel + Supabase production, a citation-accuracy eval set (does every quoted verse match the database, are cites well-formed), cost and usage dashboard, abuse limits.

## Open questions

1. **Doctrinal stance wording.** The default is non-denominational creedal Christianity. Should sholam lean toward a tradition, or name one in settings?
2. **Card publishing.** Do user cards publish at once (flag to hide), or wait in a review queue?
3. **Second translation in the UI.** Offer a BSB/WEB toggle, or keep one text?
4. **Model and cost.** ERNIE 5.5 Flash Preview (free) via OpenRouter is the default. Revisit with real usage numbers in Phase 5.
5. **Embedding provider** for semantic search: Voyage, OpenAI, or an open model run locally (SEARCH.md §9).
6. **Discover cards in study mode:** self-reflection only, or let the agent react to the student's written answer? (HARNESS-UI.md §10 asks the same about reflection cards.)
7. **FaithMap updates:** is `data/sources/faithmap_132_curated_questions.md` the master copy, or will the team keep editing it elsewhere? Rerun `npm run faithmap:convert` and `npm run seed:flashcards` after each change.
