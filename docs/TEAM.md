# sholam team and workflow

Last updated: 2026-11-14

How the people (and their coding agents) working on sholam split the work and keep `main` deployable. Product decisions live in [PLAN.md](PLAN.md); this doc is about who does what and how changes land.

## Who works on what

| Area | Who | Where it lives |
|---|---|---|
| Visual theme: cloud sky, blue glass UI | Jeff ([`jeffleunglife`](https://github.com/jeffleunglife)) | branch `jeffs-uis`, PR #1 |
| Flashcard UI/UX: one card at a time, swipe deck, hand a card to chat, bottom dock navigation | Ricky ([`RedTotally`](https://github.com/RedTotally)) | branch `ricky-prs` (no PR yet) |
| Data (Bible import, decks, FaithMap), search, agent harness, model route, Supabase/Vercel/CI, docs | owenisas ([`owenisas`](https://github.com/owenisas)) with coding agents | `main` |

Overlap to watch: Jeff's commit is also inside `ricky-prs`, and both branches touch `src/components/shell/*` and `src/components/flashcards/*`. Agree on the merge order (suggested: Jeff's PR first, then Ricky's branch rebuilt on top of `main`).

## How changes land

1. Branch from the latest `main` (`git fetch && git switch -c <name> origin/main`).
2. Before opening or updating a PR, merge `main` into the branch and fix conflicts.
3. A PR needs green **CI** (lint, typecheck, unit tests, seed check, `next build` with no secrets) and a green **Vercel preview**. Run `npm run lint && npm run typecheck && npm test && npm run build` locally first; `next dev` does not catch prerender errors.
4. Don't push to someone else's branch; comment on their PR instead.
5. A change to a product decision (navigation, card kinds, tone) gets a row in PLAN.md's decisions table in the same PR. Keep one canonical doc per topic (AGENTS.md lists them).
6. Coding agents read `AGENTS.md` (`CLAUDE.md` is a symlink to it). Its product rules apply to every branch.

## Branch status (2026-11-14)

Both teammate branches start from the first skeleton commit (`6cc9295`). Since then `main` gained the real database, 31,086 BSB verses, discover cards and docs.

**Why the Vercel previews fail:** on `6cc9295`, `listFlashcards` throws "not implemented" whenever `DATABASE_URL` is set. Vercel preview builds have that variable (the Supabase project), so prerendering `/flashcards` fails. Merging `main` fixes it.

Conflicts when merging `origin/main` into each branch (checked with `git merge-tree`, nothing pushed):

| Branch | Conflicting files | How to resolve |
|---|---|---|
| `jeffs-uis` | `src/components/flashcards/FlashcardsView.tsx`, `src/components/shell/ModeToggle.tsx` | Keep `main`'s logic (kind and topic filters, discover cards; the `<Suspense>` around the pathname read) and re-apply the glass classes on top |
| `ricky-prs` | `FlashcardsView.tsx`, `docs/PLAN.md`, `ModeToggle.tsx` (deleted on the branch, changed on `main`) | Keep the dock if that is the decision, but any component calling `usePathname()` must sit under `<Suspense>` or `next build` fails on `/c/[chatId]` (see `main`'s `ModeToggle.tsx` for the pattern). Make `SwipeDeck` handle both card kinds (below). In PLAN.md keep both sets of rows |

## Contract for flashcard UI work

The deck has two kinds of card. Types: `src/lib/flashcards/types.ts`; data access: `src/lib/flashcards/repo.ts`.

```ts
type Flashcard = FactCard | DiscoverCard;

FactCard      { kind: "fact"; id; question; answer; explanation?; refs: string[] /* verse ids */;
                category; tone: "fun" | "fact" | "deep"; difficulty: 1 | 2 | 3; ... }
DiscoverCard  { kind: "discover"; id; question; refs: string[] /* passages: MAT.18.21-MAT.18.35, DAN.4 */;
                category; section; tags: string[]; minutes?; difficulty?; source; ... }
```

- **Discover cards have no answer, by design.** The back shows Scripture *starting points* (use `passageLabel(ref)` from `src/lib/bible/refs.ts` for "Matthew 18:21–35") and invites the user to explore in chat. Never show an empty answer or make one up.
- Labels: `CATEGORY_LABELS`, `KIND_LABELS` (Quick facts / Discover). The deck today: 50 fact cards and 129 discover cards in 18 categories.
- Data: the page gets cards from `listFlashcards()` on the server; the client API is `GET /api/flashcards?kind=fact|discover&category=<slug>&q=<text>&limit=<1-200>`.
- Hand-off to chat: link to `/?q=<question>` (ChatView pre-fills the composer from `q`). A richer hand-off (sending the card id and its starting points) is part of Phase 2.
- Agent-driven card UI (proposals, `ask_user` questions, more card kinds such as multiple choice and true/false) is designed in [HARNESS-UI.md](HARNESS-UI.md) §5–6. That design is input for the flashcard UI owner, not a fixed spec.
- Before restyling, agents load the `deslop-law` and `hallmark` skills (AGENTS.md).

## Accounts and environments

| What | Where | Owner |
|---|---|---|
| Code | [FaithTechGlobalLabs/HK-Hack26-sholam](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam) (public) | org |
| Production | [sholam.vercel.app](https://sholam.vercel.app); health check at [`/api/health`](https://sholam.vercel.app/api/health) | Vercel team `owenisas-projects` (Hobby) |
| Previews | one per PR, from Vercel's Git integration | same |
| Database and auth | Supabase project `sholam`, Singapore, free plan | owenisas |
| Model | OpenRouter chat completions (`deepseek/deepseek-v4.1-flash` by default); key in Vercel env only | team |

Secrets never go into the repo, issues or chat. Production and preview env vars are managed in Vercel; local values in `.env.local` (gitignored, see `.env.example`).
