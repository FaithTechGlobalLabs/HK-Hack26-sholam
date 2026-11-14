# sholam team and workflow

Last updated: 2026-11-14

How the people (and their coding agents) working on sholam split the work and keep `main` deployable. Product decisions live in [PLAN.md](PLAN.md); this doc is about who does what and how changes land.

## Who works on what

| Area | Who | Where it lives |
|---|---|---|
| Visual theme: cloud sky, blue glass UI | Jeff ([`jeffleunglife`](https://github.com/jeffleunglife)) | `src/components/shell/CloudSky.tsx`, `src/app/sky.css`; merged through PR #2 |
| Flashcard UI/UX: one card at a time, swipe deck, hand a card to chat, bottom dock navigation | Ricky ([`RedTotally`](https://github.com/RedTotally)) | `src/components/flashcards/SwipeDeck.tsx`, `src/components/ui/dock.tsx`; PR #2 merged 2026-11-14 |
| Live chat: OpenRouter agent loop ("Shalom Guide"), tools, rate limits, browser chat history | MustyDusty | `src/lib/agent/` (`openrouter.ts`, `harness.ts`, `rate-limit.ts`, tools), `src/lib/chat/local-history.ts`; pushed to `main` |
| Data (Bible import, decks, FaithMap), search, model route, Supabase/Vercel/CI, docs | owenisas ([`owenisas`](https://github.com/owenisas)) with coding agents | `main` |

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

### MustyDusty's OpenRouter work + PR #2, combined 2026-11-14

MustyDusty pushed four commits to `main` while PR #2 was being merged (live OpenRouter chat, tools, rate limits, local history, the "Shalom" name). Both were combined without dropping either:

- Their agent, model route, copy and tests are kept as they are.
- Their sidebar (which listed recent chats) is replaced by PR #2's dock, so the history list moved into a **Chats** panel opened from the dock (`ChatHistoryPanel.tsx`).
- Their "Related in Shalom" link (`/flashcards?card=<id>`) now opens the swipe deck on that card.
- The UI name lives in one constant, `src/lib/brand.ts` (`BRAND_NAME`, currently "Shalom"); the logo wordmark, header and sign-in page read it.
- One Vitest config remains (theirs, with the `server-only` mock).

### Desktop layout and switching animation, 2026-11-14

- Desktop (768px and up) is back to ChatGPT's layout: `DesktopSidebar.tsx` (collapsible to an icon rail, with Search chats over this tab's chats) and `ModeToggle.tsx` (Chat | Flashcards, top centre). Ricky's dock stays as the phone navigation; CSS picks one by width.
- Switching between Chat and Flashcards animates: pages wrap in `SectionTransition`, links carry `transitionTypes` from `nav.ts`, and the CSS lives at the end of `app/sky.css`. Any new link between the two sections should pass `sectionTransition(from, to)`.
- `SHOLAM_MODEL` now only accepts `:free` ids (`openrouter-config.ts`).

### Jeff's flashcard carousel and sky dock (from `jeffs-uis` 30df585), 2026-11-14

Taken file by file (the branch was not merged; its `AppShell.tsx` is older than `main`'s):

- **Carousel:** `SwipeDeck.tsx` is Jeff's design (centred sharp card, blurred neighbours, sky art over a tree line, the bubble bridge, ticks and `01 / 179` counter) with the earlier review fixes put back: gesture state resets when Next hides the page (`asked` never reset, so the deck froze after Back), primary button and one pointer only, `pointercancel` snaps back instead of acting as a release, reduced motion drops the slides, the gradient shows when WebGL can't draw, an `aria-live` line, visible **Ask in chat** and **Next** buttons, both card kinds (`discover` shows "Start reading" and passages, never an answer; labels use `passageLabel`). The hold hands off with `queueChatQuestion` + `transitionTypes: ["to-chat"]`, not his `?q=…&send=1`. Card width and art height are CSS (`cqw`, `cqh`), so the server render has the right size and short phones get a shorter sky instead of overflowing. Arrow keys stay global as in his version, but ignore inputs, dialogs and modifier keys.
- **Phone dock:** the `sky` theme, `data-active`, `.dock-face` and the bottom underline in `dock.tsx`, `BibleChatIcon` (`BrandIcon.tsx`) for Chat, `bounce={false}`, and the bubble-bridge and dock rules at the end of `app/sky.css`. The active item still carries the `dock-current` view-transition name, so the lit tile glides. The open **Chats** item gets the lit tile without the underline (it is a panel, not a page). **Sign in** stays in the dock after a separator, since his `AccountButton` is not taken.
- **Left out:** the Letters page, its dock item and data; `SplashScreen.tsx` and its CSS; `AccountButton.tsx` (Phase 2); `usage-stats.ts` (`countSwipe`, `recordVisitDay`; the deck does not need it); his `AppShell.tsx`; his deck-reset bookkeeping (the view remounts the deck by `key`); his global Enter/Space flip (the centred card is a button instead).
- **Not taken:** his `FlashcardsView.tsx` change (`pb-8` → `pb-28`). This view also has the kind switch and the Next / Ask row, so the extra padding pushed the deck into the filters on a 667px-tall phone; the deck sizes itself to the space instead.

### Chat harness fixes (branch `chat-harness-fixes`), 2026-11-14

For MustyDusty (Marcus), whose loop this is. The project owner asked for these after a code review and a production test of 11 turns. Your structure (manual streaming loop, OpenRouter client, tools, free-model pacing) is unchanged; these are the parts that moved and why.

- **Citations (`harness.ts`, `citations.ts`).** The final step used to fetch unverified cites after the answer (`fetchCitedVerses`) and send them as `verses`, so the UI showed them as verified chips. In production 3 of 10 turns quoted Scripture from memory that way, including Romans 8:28 in NKJV wording labelled "BSB". Now a cite counts only if a tool returned it before the answer, and `checkAnswer` also compares quoted words with the fetched text. When a draft quotes from memory, the server fetches those verses and asks for one rewrite. That is the pass removed in 8884bb7, back, but cheaper: only on a violation, no tools, and the streamed draft is swapped through a new `reset` event. A final `citations` event tells the UI what stays unverified.
- **Why the model skipped tools.** The system prompt said "Do not call a tool before answering", and the loop allowed one tool round, often spent on `search_flashcards`, with no tools on the next call. Now the prompt says to fetch before citing or quoting. Tools are offered for two rounds within four requests, and the `search_flashcards` description says the session note already has the matched cards. Expect two requests on most faith answers.
- **Tool calls as text (`tool-call-text.ts`, `openrouter.ts`).** Two production answers were raw `<tool_call><function=…>` text. It happened when tools were left out of the request (the "propose" case after a tool round) and on the donkey question. The stream now holds back such blocks, the way `reasoning-filter.ts` handles `<think>`, and turns them into real tool calls. Every request sends the same tool list, with `tool_choice: "none"` when tools are not offered.
- **Stop (`route.ts`, `events.ts`, `openrouter.ts`).** `request.signal` and the SSE stream's `cancel()` now abort the turn. That cancels the OpenRouter fetch, tool fetches and retry sleeps, and an abort is not reported as an error. `useChatStream` also aborts when the chat unmounts.
- **Long chats (`useChatStream.ts`, `route.ts`, `context.ts`).** The browser sends the newest 12 turns. The route trims instead of rejecting more than 40, so sends no longer fail from about message 22.
- **Context size (`limits.ts`, `context.ts`).** Every cap is in `LIMITS`: history, card lines, tool results, the whole prompt. `buildMessages` still exists and now goes through `assemblePrompt`.
- **Verses (`src/lib/bible/bsb.ts`).** Read from the `verses` table when `DATABASE_URL` is set. helloao stays only as the no-database fallback, with timeouts, and a failed load is no longer cached forever. Lookups stop at 40 verses.
- **Usage limits (`usage-limit.ts`, `usage-store.ts`, migration `0003_usage_counters`).** Per-visitor and global daily counters in Postgres, so the limit holds across Vercel instances. `rate-limit.ts` still paces 429 retries; its "50 a day" message was wrong for this account (it bought 15 credits, so the cap is 1000/day) and now names no number.
- **Not changed:** model, reasoning and provider settings; the free-only rule; `rank.ts` and `repo.ts`.

### Flashcard redesign and launch screen, 2026-11-14

- **Deck (`SwipeDeck.tsx`, Ricky/Jeff):** the owner found the card unclear (the art block had no purpose; nobody knew to tap) and asked for glass and 3D. Each card is now a glass card in a 3D carousel. The front is clear glass with the question and a **Show answer** / **Where to start** button; it turns over (a two-stage turn, so the blur holds) to a milky-glass back with the answer, **Next card** and **Ask Shalom**. The centred card tilts toward the mouse with a light that follows it. Removed: the sky-art block, the bubble bridge, the hold-to-ask gesture and the ticks (now `‹ 12 of 179 ›`). `GradientASCII.tsx` is no longer used; it is kept for now. The placeholder from the load-time work (`SwipeDeckPlaceholder`) is the same glass card.
- **Launch screen (Jeff's, from `30df585`):** `SplashScreen.tsx` + `splash.css` + `splashSession.ts`, using our cross-cloud mark (`LogoMarkParts` in `Logo.tsx`, same geometry as `LogoMark`) and the `BRAND_NAME` wordmark instead of the speech-bubble icon and "sholam". Classes use a `launch-` prefix so they do not collide with `.splash-*` if `jeffs-uis` lands later.
- **MustyDusty's "card blur transition" (1c75278, pushed to `main` the same hour):** it softened Jeff's white answer panel during the tap-to-reveal. The redesign removes that panel and the tap reveal (the card now turns over to its back), so its `.deck-*` rules were dropped in the merge rather than left as dead CSS. The turn-over is the reveal animation now; adjust it in the `Flashcards (SwipeDeck)` section of `app/sky.css`.
- **Glass fix for everyone:** hand-written `-webkit-backdrop-filter` lines were removed from `sky.css`. The CSS pipeline kept only the prefixed property when both were written, so Chrome showed no blur on `.glass` or the glass buttons. Write `backdrop-filter` alone.

Please push to a branch and open a PR rather than pushing to `main` directly: it gives CI and a preview a chance to catch problems first, and avoids two people merging over each other.

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
| Model | OpenRouter chat completions, free models only (`nvidia/nemotron-3-ultra-550b-a55b:free` by default); key in Vercel env only | team |

Secrets never go into the repo, issues or chat. Production and preview env vars are managed in Vercel; local values in `.env.local` (gitignored, see `.env.example`).

### Accounts (branch `accounts`), 2026-11-14

- Sign-in is one flow for new and returning people: an email with a code and a link (ARCHITECTURE.md, Auth). The code works on any device; the link opens `/auth/confirm`, which signs in only after a button press.
- The account shows at the bottom of the desktop sidebar and top-right on phones (`AccountButton.tsx`, after Jeff's design). **Jeff:** the dock's "Sign in" item (`ShellDock.tsx`) is now redundant on phones and still shows when signed in; remove it or swap it for something else when convenient.
- Chats for signed-in people are stored per account (`src/lib/chat/store.ts`); the sidebar and the phone Chats panel use `useChatList()`. Saving is wired through the harness: `runAgentTurn` takes an optional `onFinish`, which `finishTurn` calls before `done`; `/api/chat` uses it to save signed-in turns. `useChatStream(chatId, initial)` opens saved chats and no longer writes signed-in chats to the tab.
- The phone Chats panel is now a near-opaque deep-blue surface: inside the footer its glass could not blur the page, so the suggestion chips showed through the titles.

