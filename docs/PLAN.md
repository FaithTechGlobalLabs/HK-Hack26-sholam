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
| 2026-11-14 | Default model `nvidia/nemotron-3-ultra-550b-a55b:free` only; reasoning off; no paid fallback | Superseded by DeepSeek, then restored the same day (rows below) |
| 2026-11-14 | Default model `deepseek/deepseek-v4.1-flash`; reasoning off; providers sorted by price | User asked to leave the free-model quota. This id is paid and cheap. Superseded the same day: free models only (row below) |
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
| 2026-11-14 | Desktop (768px and up) keeps ChatGPT's layout: a collapsible left sidebar (New chat, Search chats, Flashcards, this tab's chats, Sign in) and a Chat \| Flashcards toggle at the top centre. The dock is for phones only | Owner decision. The dock suits thumbs; on a desktop the ChatGPT layout is what people expect |
| 2026-11-14 | Switching views animates with React `<ViewTransition>`: the page slides left going to Flashcards and right coming back; the toggle pill, the sidebar highlight and the dock tile glide to the new item | Owner request. Built on Next 16's view transitions, so unsupported browsers switch instantly and reduced motion turns the slide into a quick crossfade |
| 2026-11-14 | Free OpenRouter models only, default `nvidia/nemotron-3-ultra-550b-a55b:free`: `SHOLAM_MODEL` must end in `:free`, otherwise the default is used. `OPENROUTER_API_KEY` (sensitive) and `SHOLAM_MODEL` are set in Vercel for Production and Preview | Owner decision, replacing the DeepSeek row. The key also carries a $3 credit limit on the OpenRouter side |
| 2026-11-14 | The public deck is cached (`"use cache"`, hourly, tag `flashcards`) and `/flashcards` is a static page; the browser shuffles it once per visit; functions run in `sin1` next to the database | The page took seconds: every request ran a function in `iad1` that opened a connection to Singapore before the deck could stream. Now the CDN serves the cards (first card 1.4 s → 0.18 s locally). Numbers in ARCHITECTURE.md |
| 2026-11-14 | A citation is verified only if a tool returned the verse before the answer was written and the quoted words match the BSB text; nothing fetched after the answer shows as verified. A draft that quotes Scripture from memory gets one corrective rewrite (server fetches the verses, the browser swaps the draft via a `reset` event); if no request is left, the cites stay unverified | Rule 1. Production test 2026-11-14: 3 of 10 turns quoted from memory (one NKJV text labelled BSB) and showed verified chips, because unfetched cites were fetched after the answer |
| 2026-11-14 | System prompt: "fetch before you cite or quote; never quote from memory" replaces "Do not call a tool before answering". Tools are offered for up to 2 rounds within 4 model requests per turn (was 1 round, 3 requests); `search_flashcards` is described as rarely needed because the session note already lists matched cards | The no-tool line and the single tool round, often spent on `search_flashcards`, left the model no way to fetch verses. Most faith answers now take 2 requests instead of 1 |
| 2026-11-14 | Verse text comes from the Postgres `verses` table whenever `DATABASE_URL` is set; `bible.helloao.org` is only the no-database fallback (timeouts, failed loads not cached). A lookup returns at most 40 verses from 6 chapter spans | No third-party dependency in production; "Genesis 1-50" no longer fetches 50 chapters |
| 2026-11-14 | `/api/chat` limits in Postgres (`usage_counters`, migration `0003`): 20 turns per visitor per hour, 60 per UTC day, and 800 model requests per UTC day for everyone (`SHOLAM_DAILY_MODEL_CALLS` overrides). Visitors are keyed by user id or an HMAC of the IP, never the raw IP. Over a limit: 429 with a friendly message | Works across Vercel instances with what we have. The account bought 15 OpenRouter credits, so the free cap is 1000 requests/day (50 below 10 credits); 800 keeps headroom and one visitor cannot use up the day |
| 2026-11-14 | All context and tool-size limits in one place (`src/lib/agent/limits.ts`); long chats are trimmed to recent turns, never rejected | From about message 22 every send failed with a 400 (the route rejected more than 40 turns) |
| 2026-11-14 | Flashcards are glass cards in a 3D carousel: neighbours turn toward the centre card; the front is clear glass with the question and a visible **Show answer** (**Where to start** on discover cards); it turns over to a milky-glass back with the answer, **Next card** and **Ask Shalom**. The centred card tilts toward the pointer on desktop. The sky-art block, the bubble bridge and the hold-to-ask gesture are gone | Owner: the art block had no purpose and nobody knew to tap the card; a plain card then "lost its design taste"; "use glass UI, 3d". The glass shows the live sky, so the per-card WebGL is gone too (`GradientASCII.tsx` is no longer used) |
| 2026-11-14 | A launch screen plays once per browser session: the cross-cloud mark builds, the wordmark gets a light sweep, "Ask. Learn. Abide.", then it fades (about 2 s; 1.45 s with reduced motion). It hides itself in CSS even if JavaScript never runs, and an inline script skips it before first paint once seen | Owner asked to merge Jeff's launch screen from `jeffs-uis` with the correct logo |
| 2026-11-14 | Bible references in answers are small glass pills with a book icon (dashed with a question mark when not checked). Tapping one, or hovering on desktop, opens a card with the whole cited range from the BSB, numbered, and "Looked up before answering" or a plain reason it was not checked. Under each answer, **Copy** and **N Bible passages** open the passages in place; the Sources side panel is gone | Owner: the citation UI "isn't really clear". The old pills showed text only in a desktop tooltip (nothing on phones), a range like John 1:1–3 previewed one verse, and Sources hid the text in a side panel. This differs from HARNESS-UI.md §5 (typeset references, not pills): a visible tap target mattered more for phones |
| 2026-11-14 | Write only the unprefixed `backdrop-filter` in hand-written CSS | The CSS pipeline (Lightning CSS) collapsed `backdrop-filter` + `-webkit-backdrop-filter` into the prefixed one alone, which Chrome ignores, so `.glass` and the glass buttons never blurred in Chrome. It adds the prefix itself where needed |
| 2026-11-14 | Sign-in and sign-up are one email flow: the email carries an 8-digit code and a link. The code is typed where you asked (works across devices); the link opens a confirm page whose button signs in that browser (token_hash, no PKCE). New accounts pick a display name | Owner report: the email link "not working really well". The PKCE link only worked in the browser that asked, mail scanners could spend it, and the UI never showed you were signed in |
| 2026-11-14 | Signed in, the account sits at the bottom of the desktop sidebar (menu with Sign out) and top-right on phones (Jeff's chip); sign-out clears the tab's chat history | ChatGPT's placement on desktop; Jeff's design (jeffs-uis `30df585`) on phones. Clearing protects shared devices |
| 2026-11-14 | Signed-in chats are saved per account in Postgres and listed newest first; `/c/[chatId]` opens a saved chat only for its owner (others get not-found). Signed-out chats stay in the tab; on sign-in the tab's chats can be kept | Product rule 4 (chats are private). The server bypasses RLS, so the store filters every query by user id |
| 2026-11-14 | `messages.content` v1: user rows `{ v, text }`; assistant rows keep the OpenRouter turn's messages verbatim plus the shown text and the verse records fetched that turn | Rule 7 (append-only, verbatim) for an OpenAI-format provider; rule 1 needs the turn's verses to re-render citations honestly |
| 2026-11-14 | "Share Shalom" at the bottom of the desktop sidebar: a dialog with a QR code for `https://sholam.vercel.app` (`APP_URL` in `src/lib/brand.ts`), Copy link, and the device share sheet where available | Owner request. Lets people at a demo scan the app off a shared screen. The QR is drawn from a path generated once by the `qrcode` package (`share-qr.ts`), so no runtime dependency |
| 2026-11-14 | Discover cards now carry the team's written answer, "why this passage matters" and a one-line takeaway (FaithMap teaching notes); a revealed discover card shows takeaway, answer, refs and why the passage matters; the agent gets the answer and why. New nullable `flashcards.takeaway` column | Owner decision, replacing the "no answers on discover cards" part of the two-kinds row: the team wrote the answers themselves, so nothing is invented. The source asks for disputed or sensitive lessons to be reviewed before publication |

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
The OpenRouter streaming loop is in `harness.ts` (Postgres verse text, keyword card ranking, browser history). Still open:

- Accounts (branch `accounts`): code + link sign-in, account menu, sign-out, per-account chat store and lists, owner-only `/c/[chatId]`. Answered turns are saved and saved chats reopen. Left: owner decisions on the email templates and SMTP (ARCHITECTURE.md, Auth), then a real signed-in test.
- Search per SEARCH.md §8: `verses.pos`, a `sections` table from the importer, `search_bible` (verses + headings + any-term fallback), `read_passage`, `lookup_verses` on `parseReference`, the search policy in the prompt, and the eval on the real loop.
- `search_flashcards` and `propose_flashcard` on the database; discover cards open in chat with their starting points.
- The streaming loop in `harness.ts` (see ARCHITECTURE.md), message persistence, chat titles, history and search. The desktop sidebar and the phone Chats panel read `useChatList()` (account chats when signed in).
- Review of the OpenRouter loop (2026-11-14): all items fixed and deployed (`32de970`): citation check, usage limits, history trimming, Stop/abort, verses from Postgres, context limits, tool calls written as text. See the decisions above and TEAM.md. Migration `0003_usage_counters` was applied to production the same day, so the limits hold across instances. Production re-test of the 10 cases: no raw tool-call text, no memory quotes shown as verified, slowest first text 43.5 s → 20.2 s.
- Refusal and `max_tokens` handling (a cut-off answer is shown as it is).
- Still slow when tools run (production 2026-11-14: 23–44 s to first text; most of it is the free model's own latency). The crisis reply lists US hotlines although most users are in Hong Kong. Off-topic requests (it wrote Python) still spend free quota.

### Phase 3: flashcards and semantic search
- Hybrid semantic search (pgvector embeddings fused with full-text by RRF) once the Phase 2 eval is in; embedding provider to be chosen.
- Save from the form and from chat proposals (refs checked against `verses`), report/flag, a small moderation view. Every write calls `revalidateDeck()` so the cached deck drops.
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
Vercel + Supabase production, custom SMTP for sign-in emails (the built-in mailer sends 2 an hour, to team addresses only), a citation-accuracy eval set (does every quoted verse match the database, are cites well-formed), cost and usage dashboard, abuse limits.

## Open questions

1. **Doctrinal stance wording.** The default is non-denominational creedal Christianity. Should sholam lean toward a tradition, or name one in settings?
2. **Card publishing.** Do user cards publish at once (flag to hide), or wait in a review queue?
3. **Second translation in the UI.** Offer a BSB/WEB toggle, or keep one text?
4. **Model and cost.** ERNIE 5.5 Flash Preview (free) via OpenRouter is the default. Revisit with real usage numbers in Phase 5.
5. **Embedding provider** for semantic search: Voyage, OpenAI, or an open model run locally (SEARCH.md §9).
6. **Discover cards in study mode:** self-reflection only, or let the agent react to the student's written answer? (HARNESS-UI.md §10 asks the same about reflection cards.)
7. **FaithMap updates:** is `data/sources/faithmap_132_curated_questions.md` the master copy, or will the team keep editing it elsewhere? Rerun `npm run faithmap:convert` and `npm run seed:flashcards` after each change.
