# Shalom

Last updated: 2026-11-16

A ChatGPT-style web app for exploring the Bible and the Christian faith. Two modes sit at the top of the page:

- **Chat (Shalom Guide)**: ask anything. An OpenRouter-backed guide answers clearly for young people, cites Bible verses it looked up (Berean Standard Bible), never from memory, and links into the flashcard deck when a real card matches.
- **Flashcards**: a public deck with two kinds of card. **Quick facts** are fun or surprising questions with answers and verses. **Discover** cards are open questions for young people (the FaithMap set) with Scripture starting points to explore in chat. Browse, filter by kind and topic, study one card at a time, or add your own.

Status: **Phase 1 done** (data and deploy). The Bible text (31,086 BSB verses) and a deck of 179 cards (50 quick facts, 129 FaithMap discover questions) live in Supabase Postgres, and the app deploys to Vercel from `main`. Chat runs Shalom Guide live when `OPENROUTER_API_KEY` is set; otherwise it streams a scripted demo. **Production live chat is currently blocked (2026-11-16):** OpenRouter rejects the configured key and chat returns a public error, so the owner must check the key (see the native section below). See [docs/PLAN.md](docs/PLAN.md).

## Native iPhone and iPad app

The native SwiftUI port lives in [`ios/`](ios/README.md), alongside this website. It targets iOS/iPadOS 17+, keeps the sky/glass identity and uses the same backend. The public deck is bundled for offline reading. Every feature is free; paywalls and purchasing are disabled.

Its native shell follows ChatGPT's layout: a leading drawer on iPhone, persistent sidebar on iPad, unboxed answers and a pale composer.

**Current release state (2026-11-16): TestFlight 0.1.1 (2) is uploaded and processed (VALID) but not submitted to external Beta App Review. This is blocked on owner input, not a finished submission, and it is not available to external testers.**

- Native and backend source are committed and pushed to `main` ([`d167cac`](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/commit/d167cac), merged with latest `main` as [`a9aec36`](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/commit/a9aec36e82f38f79c01676d69bbb0b5894d3aecb), preserving Share Shalom). [GitHub CI](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/actions/runs/43806984409) passed. The backend is live on [sholam.vercel.app](https://sholam.vercel.app) (production deployment `dpl_A8TP2KrTyLzPGtVPGpojbQ72guYd`, READY, built from `a9aec36`).
- Build 0.1.1 (2) is in [App Store Connect](https://appstoreconnect.apple.com/apps/6834994638/testflight/ios) and in the existing External Beta group (public [link](https://testflight.apple.com/join/urQsNaGH), 100-tester cap, unchanged). Its external state is READY_FOR_BETA_SUBMISSION and no Beta App Review submission exists. Build 0.1.0 (1) is untouched and still WAITING_FOR_REVIEW.
- **Why the submission is held:** production chat currently returns the public error "OpenRouter rejected the API key". The native client's production probes passed for health, deck (179 cards), guest history and invalid-Bearer rejection (401), but both chat requests failed before any text, verses or citations. This is an OpenRouter authentication rejection that needs an owner check; it is not known whether the key was revoked or the configuration is wrong. No credential was shown, changed or rotated, and no routing or paid model was enabled.
- **Owner action:** check or correct `OPENROUTER_API_KEY` securely in [Vercel Production environment variables](https://vercel.com/owenisas-projects/sholam/settings/environment-variables) (never paste a key into chat or a document), redeploy, verify live chat, then submit the **existing** 0.1.1 (2) build for external review. The key fix needs no new binary.

See [`ios/README.md`](ios/README.md#testflight-release-011-2) for the release receipt summary, tests and limits. Native sign-in and billing stay off (guest mode, empty product IDs); physical-device runtime, VoiceOver, pre-iOS-26 and native sign-in remain unverified. Raw proof files are operator-local and gitignored; the GitHub CI run, commits and App Store Connect are the stable public proof.

## Where things run

| What | Where |
|---|---|
| Code | [github.com/FaithTechGlobalLabs/HK-Hack26-sholam](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam) (public) |
| CI | GitHub Actions: lint, typecheck, tests, seed validation, build |
| Hosting | [sholam.vercel.app](https://sholam.vercel.app) (Vercel project `owenisas-projects/sholam`); `main` → production, pull requests → previews. [`/api/health`](https://sholam.vercel.app/api/health) shows the model route, agent mode and database status without secrets |
| Model | OpenRouter chat completions, free models only, `nvidia/nemotron-3-ultra-550b-a55b:free` by default (key set in Vercel env) |
| Database and auth | Supabase project `sholam` (`cpeuhxozfhrldfbjbiwt`), Singapore, free plan |

Vercel's upload allowlist is in `.vercelignore`: only the web package/configuration and `src/`, `public/`, and `data/` are deployment inputs. Native builds, caches, proof, local agent tools and environment files stay off Vercel. A strict dry run for the `a9aec36` deploy selected 127 web files (1,227,475 bytes); an earlier 125-file count predates the latest `main` merge and is obsolete.

## Run locally

Needs Node 22+.

```bash
npm install
npm run dev        # http://localhost:5310
```

It runs with no environment variables: flashcards come from `data/flashcards.seed.json` and chat streams a demo. Copy `.env.example` to `.env.local` for the database and the live guide (never commit `.env.local`):

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Server-only OpenRouter key (required for live Shalom Guide) |
| `OPENROUTER_BASE_URL` | Optional; default `https://openrouter.ai/api/v1` |
| `SHOLAM_MODEL` | Default `nvidia/nemotron-3-ultra-550b-a55b:free`. Free ids only: one without `:free` is ignored. Free ids allow about 20 requests/minute; the daily cap is 50, or 1000 once the account has bought $10 of credits. |
| `SHOLAM_AGENT` | Unset = live when a key is present; `demo` forces the scripted stream; `live` forces live (errors if the key is missing) |
| `SHOLAM_DAILY_MODEL_CALLS` | Optional. Model requests per UTC day for all visitors together (default 800, under OpenRouter's 1000/day free cap). Needs migration `0003_usage_counters` and `DATABASE_URL` to hold across instances |
| `SHOLAM_RATE_LIMIT_SALT` | Optional. Secret for hashing visitor IPs in the usage counters; falls back to another server secret |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project (auth, browser access under RLS) |
| `DATABASE_URL` | Postgres via the transaction pooler (port 6543), used by the app |
| `DIRECT_URL` | Postgres via the session pooler (port 5432), used by migrations and scripts |

## Database

```bash
npm run db:migrate           # apply drizzle/ migrations (uses DIRECT_URL)
npm run bible:import         # download BSB v5.19, verify checksum, upsert 31,086 verses
npm run seed:flashcards      # upsert both decks by slug (every passage must resolve in verses)
npm run faithmap:convert     # regenerate data/faithmap.cards.json from data/sources/*.md
npm run search:baseline      # keyword vs heading search on data/search-eval.json (see docs/SEARCH.md)
npm run model:smoke          # one tiny OpenRouter chat completion (see .env.example)
```

`npm run bible:import -- --dry-run` parses and checks without touching the database. Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.

After changing env vars, restart `npm run dev`.

For production (e.g. Vercel), set `OPENROUTER_API_KEY` as a **server** environment variable for Production and redeploy. Do not expose it as a public/`NEXT_PUBLIC_` variable.

Without a key, Chat still runs against the scripted demo stream and flashcards use the seed JSON.

## Check

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Docs

- [AGENTS.md](AGENTS.md): rules for coding agents (`CLAUDE.md` links here)
- [docs/TEAM.md](docs/TEAM.md): who works on what, how changes land, branch status, the flashcard data contract
- [docs/PLAN.md](docs/PLAN.md): roadmap, decisions, open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): agent harness, SSE protocol, data model, citations
- [docs/SEARCH.md](docs/SEARCH.md): how the agent searches the Bible (agentic search, indexes, tools, evaluation)
- [docs/HARNESS-UI.md](docs/HARNESS-UI.md): harness research, citation formats and agent-driven UI
- [docs/SOURCES.md](docs/SOURCES.md): Bible text and reference data licences
