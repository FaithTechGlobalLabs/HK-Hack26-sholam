# Shalom

A ChatGPT-style web app for exploring the Bible and the Christian faith. Two modes sit at the top of the page:

- **Chat (Shalom Guide)**: ask anything. An OpenRouter-backed guide answers clearly for young people, cites Bible verses it looked up (Berean Standard Bible), never from memory, and links into the flashcard deck when a real card matches.
- **Flashcards**: a public deck of fun and surprising Bible questions, each tied to verses. Browse, filter, study one card at a time, or add your own.

## Run

Needs Node 22+.

```bash
npm install
npm run dev        # http://localhost:5310
```

Copy `.env.example` to `.env.local` and add secrets locally (never commit `.env.local`):

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Server-only OpenRouter key (required for live Shalom Guide) |
| `OPENROUTER_BASE_URL` | Optional; default `https://openrouter.ai/api/v1` |
| `SHOLAM_MODEL` | Default `baidu/ernie-5.5-flash-preview:free`. Free models are about 20 requests/minute and 50/day until the OpenRouter account has purchased credits. A paid model id removes that daily cap. |
| `SHOLAM_AGENT` | Unset = live when a key is present; `demo` forces the scripted stream; `live` forces live (errors if the key is missing) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project (auth) |
| `DATABASE_URL` | Supabase Postgres, transaction pooler (port 6543) |

After changing env vars, restart `npm run dev`.

For production (e.g. Vercel), set `OPENROUTER_API_KEY` as a **server** environment variable for Production and redeploy. Do not expose it as a public/`NEXT_PUBLIC_` variable.

Without a key, Chat still runs against the scripted demo stream and flashcards use the seed JSON.

## Check

```bash
npm run typecheck && npm run lint && npm test
```

## Docs

- [AGENTS.md](AGENTS.md): rules for coding agents (`CLAUDE.md` links here)
- [docs/PLAN.md](docs/PLAN.md): roadmap, decisions, open questions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): agent harness, SSE protocol, data model, citations
- [docs/SOURCES.md](docs/SOURCES.md): Bible text and reference data licences
