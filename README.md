# sholam

A ChatGPT-style web app for exploring the Bible and the Christian faith. Two modes sit at the top of the page:

- **Chat**: ask anything. A Claude agent answers gently, as a Christian would, and cites Bible verses it looked up in a database (Berean Standard Bible), never from memory. It checks the flashcard deck first and can draft a new card when none fits.
- **Flashcards**: a public deck with two kinds of card. **Quick facts** are fun or surprising questions with answers and verses. **Discover** cards are open questions for young people (the FaithMap set) with Scripture starting points to explore in chat. Browse, filter by kind and topic, study one card at a time, or add your own.

Status: **Phase 1 done** (data and deploy). The Bible text (31,086 BSB verses) and a deck of 179 cards (50 quick facts, 129 FaithMap discover questions) live in Supabase Postgres, and the app deploys to Vercel from `main`. Chat still streams a scripted demo until the agent loop lands in Phase 2. See [docs/PLAN.md](docs/PLAN.md).

## Where things run

| What | Where |
|---|---|
| Code | [github.com/FaithTechGlobalLabs/HK-Hack26-sholam](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam) (public) |
| CI | GitHub Actions: lint, typecheck, tests, seed validation, build |
| Hosting | [sholam.vercel.app](https://sholam.vercel.app) (Vercel project `owenisas-projects/sholam`); `main` → production, pull requests → previews. [`/api/health`](https://sholam.vercel.app/api/health) shows the model route, agent mode and database status without secrets |
| Model | OpenRouter, `anthropic/claude-opus-5.5` by default (key set in Vercel env) |
| Database and auth | Supabase project `sholam` (`cpeuhxozfhrldfbjbiwt`), Singapore, free plan |

## Run locally

Needs Node 22+.

```bash
cd sholam
npm install
npm run dev        # http://localhost:5310
```

It runs with no environment variables: flashcards come from `data/flashcards.seed.json` and chat streams a demo. To use the database, copy `.env.example` to `.env.local` and fill it in:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project (auth, browser access under RLS) |
| `DATABASE_URL` | Postgres via the transaction pooler (port 6543), used by the app |
| `DIRECT_URL` | Postgres via the session pooler (port 5432), used by migrations and scripts |
| `OPENROUTER_API_KEY` | Model access through OpenRouter's Anthropic-compatible endpoint (the team's route) |
| `SHOLAM_MODEL` | Optional; defaults to `anthropic/claude-opus-5.5` on OpenRouter, `claude-opus-5-5` direct |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | Alternative route: Anthropic directly or a local gateway (CLIProxyAPI `:18317`, LiteLLM `:4000`) |
| `SHOLAM_EFFORT` | `low` … `max` (default `medium`), or `off` to send no effort parameter |
| `SHOLAM_AGENT` | `live` for the real loop (Phase 2); otherwise the demo stream |
| `SHOLAM_FALLBACKS` | `default` turns on server-side refusal fallbacks (direct Anthropic API only) |

## Database

```bash
npm run db:migrate           # apply drizzle/ migrations (uses DIRECT_URL)
npm run bible:import         # download BSB v5.19, verify checksum, upsert 31,086 verses
npm run seed:flashcards      # upsert both decks by slug (every passage must resolve in verses)
npm run faithmap:convert     # regenerate data/faithmap.cards.json from data/sources/*.md
npm run search:baseline      # keyword vs heading search on data/search-eval.json (see docs/SEARCH.md)
npm run model:smoke          # one tiny request through the configured model route
```

`npm run bible:import -- --dry-run` parses and checks without touching the database. Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` and `npm run db:migrate`.

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
