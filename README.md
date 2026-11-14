# sholam

A ChatGPT-style web app for exploring the Bible and the Christian faith. Two modes sit at the top of the page:

- **Chat**: ask anything. A Claude agent answers gently, as a Christian would, and cites Bible verses it looked up in a database (Berean Standard Bible), never from memory. It checks the flashcard deck first and can draft a new card when none fits.
- **Flashcards**: a public deck of fun and surprising Bible questions, each tied to verses. Browse, filter, study one card at a time, or add your own.

Status: **Phase 0, skeleton**. The app runs and the UI is wired end to end against a scripted demo stream and a 10-card seed deck. The agent loop, Bible import, database and sign-in are specified and stubbed. See [docs/PLAN.md](docs/PLAN.md).

## Run

Needs Node 22+.

```bash
cd sholam
npm install
npm run dev        # http://localhost:5310
```

No environment variables are needed for the skeleton. To configure the later phases, copy `.env.example` to `.env.local`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (or a local gateway's key with `ANTHROPIC_BASE_URL`) |
| `ANTHROPIC_BASE_URL` | Optional: CLIProxyAPI `http://127.0.0.1:18317` or LiteLLM `http://127.0.0.1:4000` |
| `SHOLAM_MODEL` | Default `claude-opus-5-5` |
| `SHOLAM_EFFORT` | `low` … `max`, default `medium` |
| `SHOLAM_AGENT` | `live` for the real loop (Phase 2); otherwise the demo stream |
| `SHOLAM_FALLBACKS` | `default` turns on server-side refusal fallbacks (direct Anthropic API only) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project (auth) |
| `DATABASE_URL` | Supabase Postgres, transaction pooler (port 6543) |

## Check

```bash
npm run typecheck && npm run lint && npm test
```

## Docs

- [AGENTS.md](AGENTS.md): rules for coding agents (`CLAUDE.md` links here)
- [docs/PLAN.md](docs/PLAN.md): roadmap, decisions, open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): agent harness, SSE protocol, data model, citations
- [docs/SOURCES.md](docs/SOURCES.md): Bible text and reference data licences
