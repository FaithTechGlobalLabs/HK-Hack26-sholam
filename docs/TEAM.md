# sholam team and workflow

Last updated: 2026-11-14

How the people (and their coding agents) working on sholam split the work and keep `main` deployable. Product decisions live in [PLAN.md](PLAN.md); this doc is about who does what and how changes land.

## Who works on what

| Area | Who | Where it lives |
|---|---|---|
| Visual theme: cloud sky, blue glass UI | Jeff ([`jeffleunglife`](https://github.com/jeffleunglife)) | `src/components/shell/CloudSky.tsx`, `src/app/sky.css`; merged through PR #2 |
| Flashcard UI/UX: one card at a time, swipe deck, hand a card to chat, bottom dock navigation | Ricky ([`RedTotally`](https://github.com/RedTotally)) | `src/components/flashcards/SwipeDeck.tsx`, `src/components/ui/dock.tsx`; PR #2 merged 2026-11-14 |
| Data (Bible import, decks, FaithMap), search, agent harness, model route, Supabase/Vercel/CI, docs | owenisas ([`owenisas`](https://github.com/owenisas)) with coding agents | `main` |

Both now build on `main`. New work starts from the latest `main` on a fresh branch.

## How changes land

1. Branch from the latest `main` (`git fetch && git switch -c <name> origin/main`).
2. Before opening or updating a PR, merge `main` into the branch and fix conflicts.
3. A PR needs green **CI** (lint, typecheck, unit tests, seed check, `next build` with no secrets) and a green **Vercel preview**. Run `npm run lint && npm run typecheck && npm test && npm run build` locally first; `next dev` does not catch prerender errors.
4. Don't push to someone else's branch; comment on their PR instead.
5. A change to a product decision (navigation, card kinds, tone) gets a row in PLAN.md's decisions table in the same PR. Keep one canonical doc per topic (AGENTS.md lists them).
6. Coding agents read `AGENTS.md` (`CLAUDE.md` is a symlink to it). Its product rules apply to every branch.

## Merge log

### PR #2 (Ricky, includes Jeff's PR #1 commit), merged 2026-11-14

Both branches had started from the first skeleton commit, so their Vercel previews failed (on that commit `listFlashcards` threw whenever `DATABASE_URL` was set). PR #2 was merged into `main` with these changes on top, so it builds and handles today's data:

- **Conflicts resolved:** `ModeToggle.tsx` stays deleted (the dock replaces it); PLAN.md keeps both sides' decision rows; `FlashcardsView` keeps Ricky's one-card layout and adds an All / Quick facts / Discover switch.
- **Build fix:** `AppShell` read `usePathname()` at the top of the layout, which fails `next build` on `/c/[chatId]` under Cache Components. The dock moved into `ShellDock.tsx` inside `<Suspense>` (the fallback shows the dock with nothing highlighted).
- **Discover cards in the swipe deck:** `SwipeDeck` reveals a discover card's starting points (no answer) and labels passages with `passageLabel`; a hold sends "help me explore…" instead of "explain…".
- **Reviewed by two agents** (design against deslop-law/hallmark; engineering) and fixed in the merge:
  - Swipe deck: visible **Next** and **Ask in chat** buttons, a card counter, arrow keys, a first-use hint, a hold-progress bar, `aria-live` on the card; it resets its gesture state when Next 16 brings the page back (it froze after Back); primary-button-only gestures, cancel never advances, `touch-pan-y`; the card fits above the dock on phones; a colour fallback when WebGL is missing; reduced motion skips the fly-out; the revealed fact card leads with the answer.
  - "Hold to ask" now hands the question to chat through one-shot `sessionStorage` (`src/lib/chat/handoff.ts`), not `?send=1`, which let any link or hidden iframe fire a paid model call. Every page sends `frame-ancestors 'none'` / `X-Frame-Options: DENY`.
  - Contrast: the selected filter chip, assistant answers (now on a deep-blue glass panel), verse chips, footnote, sources text, suggestion chips, deck buttons. Hover "jump" transforms removed from glass buttons. Dock: active page gets a solid blue tile and `aria-current` instead of a faint dot; routes prefetched. `/login`'s button was white on white.
  - Sky capped at 30 fps (halves per-frame work on phones). `dock.tsx` and `GradientASCII.tsx` are React Bits copies: their MIT + Commons Clause notice is now in the file headers (keep it; never publish them as standalone components).
- **Left for the owners (not changed):** card palettes are Tailwind indigo/purple/fuchsia/orange under a dark scrim, which deslop flags and which clash a little with the day sky (Ricky); small captions under dock icons on touch screens (Ricky); `CloudSky` keeps a "hole" where a finger last touched and rebuilds clouds on every resize, e.g. when the Android keyboard opens (Jeff); unused `DockMenu` in `dock.tsx`; "New chat" can show the previous conversation because Next keeps `/` alive; a rate limit on `/api/chat` before the agent goes live (Phase 2).
- Jeff's PR #1 commit is part of this merge, so PR #1 closes as merged.
- `StudyMode.tsx` and the grid `FlashcardCard.tsx` are no longer used by any page; Ricky decides whether to delete them.

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
| Model | OpenRouter (`anthropic/claude-opus-5.5` by default); key in Vercel env only | team |

Secrets never go into the repo, issues or chat. Production and preview env vars are managed in Vercel; local values in `.env.local` (gitignored, see `.env.example`).
