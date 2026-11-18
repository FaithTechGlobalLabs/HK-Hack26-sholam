# Shalom native UI review: Opus

Last updated: 2026-11-19

Source-publication note, 2026-11-19: the native inputs in this repository change match all 101 files frozen for TestFlight 0.1.3 (4). The runtime, signing and Apple results below remain the November 18 runs, not a new native build. Archives, caches and raw QA proof stay operator-local and ignored; only the separately identified App Store screenshot candidates are versioned.

## Scope and evidence

The owner requested an Opus review, especially of animation and response presentation. Two Opus passes reviewed motion/interaction and answer/citation presentation independently. Sections below ("Verdict" through "Keep") are the original audit and describe the **released 0.1.0 (1) source**. Local fixes applied afterwards are recorded in [Local fixes applied, 2026-11-16](#local-fixes-applied-2026-11-16).

The reviewers used the final iPhone/iPad simulator screenshots, current SwiftUI source and the saved production chat stream. All 29 App Swift files match the released 0.1.0 (1) source snapshot; the controller also checked all 91 snapshot files and found no changes. No app code was edited, no simulator was started and no new binary was built or submitted for this review.

There is no motion recording. Motion timing and potential distraction are source-based judgments, not observations of a running animation. There are no measured frame-rate, battery or scrolling-performance claims. The screenshot answer is explicitly synthetic; the saved live Jonah answer is separate evidence.

Apple's live external Beta App Review status for 0.1.0 (1), checked on 2026-11-16 (original audit date), remained **WAITING_FOR_REVIEW**; later 0.1.1 (2) state is in [Release follow-through](#release-follow-through-2026-11-16). Processing is VALID and internal testing is active, but external review is not complete.

## Verdict

The base navigation and native passage sheet should stay. The next pass should make the app a calmer reading/study surface rather than add another visual theme: static brand artwork during reading, less carousel movement, clearer answer structure and one coherent citation/action system.

There are also two functional presentation gaps, not merely taste issues: numbered lists lose their structure, and plain-text Bible references can bypass the source controls and unchecked-reference labels.

## Major findings

### 1. Continuous sky motion competes with reading

**Tell:** decorative motion without task information.

**Where:** [SkyBackground.swift:26–42](../ios/App/Theme/SkyBackground.swift:26), attached to every section at [RootView.swift:89](../ios/App/RootView.swift:89).

**Evidence:** source-confirmed. The sky schedules updates at up to 30 Hz while active unless Reduce Motion or Low Power Mode is enabled. Cloud drift, bob and cross movement continue behind chat and study content. Actual motion feel was not captured.

**Correction:** make the sky still by default, especially whenever a conversation or card answer is being read. Keep the gradient, clouds and cross-cloud as brand artwork. Do not require users to change a system accessibility setting just to get a calm reading mode.

### 2. Real plain-text references bypass the citation UI

**Tell:** important source access depends on model formatting rather than a robust presentation contract.

**Where:** [CitationResolver.swift:44–50](../ios/Packages/ShalomCore/Sources/ShalomCore/Citations/CitationResolver.swift:44), [CitationResolver.swift:98](../ios/Packages/ShalomCore/Sources/ShalomCore/Citations/CitationResolver.swift:98), [AnswerView.swift:35](../ios/App/Chat/AnswerView.swift:35), and the [saved production stream](../ios/Verification/native-api-live-smoke.sse).

**Evidence:** source and saved live response. The Jonah answer contains plain references such as `(Jonah 1:1–3, 17)` and `(Matthew 12:39–41)`, but no `verse:` Markdown links. The native resolver builds its passage controls only from those links, so that particular response would have no reference chips or expandable passage list. The reply also mentions 2 Kings 14:25, which is absent from the returned verse records; the final server citation event nevertheless has an empty unverified list. This is an unmarked coverage gap, not evidence that the UI falsely painted the plain reference green.

**Correction:** make cited passage identity and checked state explicit at the response boundary, or canonicalize supported reference syntax before final checking. Plain references outside the current turn's fetched-before-answer evidence must remain unchecked and be exposed as such. Never fetch after answering merely to upgrade a citation, and never infer verification from an empty issue list alone. Native styling by itself cannot repair this shared server/renderer contract gap.

### 3. References and actions fragment the answer

**Tell:** repeated tinted metadata controls and competing hierarchy.

**Where:** [AnswerView.swift:35–109](../ios/App/Chat/AnswerView.swift:35), [AnswerView.swift:299–303](../ios/App/Chat/AnswerView.swift:299), and the [iPhone answer screenshot](../ios/Verification/iphone-final-verified-answer-fixture.jpg).

**Evidence:** screenshot-visible and source-confirmed. References appear inline with a white background and underline, again as separate pills, and through an expandable passage section. The full verse labels are not literally repeated three times while the disclosure is closed, but three different affordances compete for the same material. Copy occupies a separate row between source controls. Inline highlighting resembles text selection.

**Correction:** remove the selection-like inline background and consolidate source/actions into a quieter, consistent arrangement. Preserve an accessible 44pt way to open checked or unchecked references, and retain the full passage sheet. Avoid simply deleting the only large tap targets.

### 4. Numbered lists collapse into prose

**Tell:** response structure is lost by the renderer; this is a functional formatting defect.

**Where:** [AnswerView.swift:255](../ios/App/Chat/AnswerView.swift:255), [AnswerView.swift:309–340](../ios/App/Chat/AnswerView.swift:309).

**Evidence:** source-confirmed, not newly rendered. The block parser recognizes headings, quotes, `-`/`*` bullets and code, but not ordered-list items. Consecutive `1. ...` and `2. ...` lines fall through to the paragraph buffer and are joined with spaces. Paragraph and bullet blocks also share the same outer spacing.

**Correction:** preserve numbered-list blocks and their original markers, distinguish list-item spacing from paragraph spacing, and handle supported Markdown consistently. Add rendering tests for real multi-paragraph answers, numbered steps, bullets, quotes, long references and unfinished streaming Markdown.

### 5. Streaming feedback and following are fragile

**Tell:** competing loading signals and unstable interaction state.

**Where:** [AnswerView.swift:18–28](../ios/App/Chat/AnswerView.swift:18), [ChatScreen.swift:65–92](../ios/App/Chat/ChatScreen.swift:65).

**Evidence:** source-confirmed; perceived jitter is inferred. A tool spinner can coexist with the separate Thinking indicator. Every text mutation requests a scroll to the end; this does not prove every request produces a visible jump. Any drag turns following off, and manually returning to the bottom does not restore it. A simple tap is not the same as a drag. Re-parsing partial Markdown can temporarily expose unfinished link syntax.

**Correction:** use one status line that changes from thinking to the current lookup, avoid redundant per-chunk scrolling, and resume following when the user is actually at the bottom. Use reliable viewport/scroll geometry rather than treating a lazy stack's `onAppear` as exact visibility. Preserve user-controlled reading position and render unfinished Markdown without flashing raw control syntax.

### 6. Carousel motion is disproportionate to study navigation

**Tell:** excessive spatial transformation and competing ghost text.

**Where:** [FlashcardCarousel.swift:144](../ios/App/Flashcards/FlashcardCarousel.swift:144), [FlashcardCarousel.swift:225](../ios/App/Flashcards/FlashcardCarousel.swift:225), [FlashcardCarousel.swift:251](../ios/App/Flashcards/FlashcardCarousel.swift:251), [ShalomTheme.swift:88–90](../ios/App/Theme/ShalomTheme.swift:88), and the [iPad card-answer screenshot](../ios/Verification/ipad-landscape-flashcard-answer.jpg).

**Evidence:** source and screenshot. Neighboring cards rotate, scale and slide during navigation, and skewed side-card text remains visible beside an answer. The navigation timing curve lasts 0.6 seconds; it is a cubic-bezier-style timing curve, not a spring. A strong swipe can advance up to three cards. The deck is not a continuously running idle animation: the continuous movement concern belongs primarily to the sky.

**Correction:** keep the glass/physical card identity but greatly reduce moving perspective and hide text on non-centred cards. Make study navigation predictably one card per swipe and use a shorter, non-bouncy transition. A deliberate question-to-answer reveal can remain useful; shorten it or use a quiet crossfade if near-zero motion is preferred.

## Minor finding

### 7. The iPad answer measure is too wide for sustained prose

**Where:** [ChatScreen.swift:61](../ios/App/Chat/ChatScreen.swift:61), compared with the passage sheet in [AnswerView.swift:218](../ios/App/Chat/AnswerView.swift:218).

**Evidence:** screenshot and source. Chat content permits a 760pt column, which produces long lines at the normal body size. The short fixture understates the reading cost of a longer real answer.

**Correction:** cap assistant prose around 600–640pt on regular width while allowing appropriate room for the composer and user bubble. Verify long answers and Dynamic Type rather than optimizing only the short fixture.

## Keep

- Shalom's sky palette and cross-cloud artwork, with calmer defaults.
- The iPhone drawer and persistent iPad sidebar.
- Unboxed assistant prose and a quiet right-aligned user bubble.
- The numbered full-range passage sheet and honest checked/unchecked states.
- Dynamic Type, accessible reference labels and 44pt targets.
- Reduce Motion, Reduce Transparency and Low Power handling.
- Short task-relevant feedback, rather than deleting all interaction cues.

## Recommended next pass

Treat this as one calm-reading pass: stop ambient reading motion, simplify carousel navigation, fix list/stream presentation, consolidate reference/actions and close the plain-reference coverage gap without weakening citation provenance. A new build or TestFlight submission is not part of this audit. The pass was then applied locally; see the next section.

0 critical · 6 major · 1 minor (original audit, unchanged).

## Local fixes applied, 2026-11-16

The owner approved applying this audit. At the time of this pass the fixes existed only in local source (the statements in this section and the verification below are historical to that pass). Released TestFlight build **0.1.0 (1) is historical and does not contain them**. They were shipped afterwards; see [Release follow-through](#release-follow-through-2026-11-16), which supersedes the local-only claims. Authentication and billing stay disabled; no credentials were inspected.

| # | Finding | Local change |
|---|---|---|
| 1 | Sky motion | Sky is a static `Canvas`; no timeline updates, so reading no longer depends on Reduce Motion or Low Power. Gradient, clouds and cross-cloud artwork kept. |
| 2 | Plain references | Server `finalizeAnswer` normalizes supported English plain Bible references into `verse:` links **for display only**. Raw model output and stored history blocks stay verbatim. Exact-quote checks are strict, cover the full range and count only verses fetched before the answer. A corrected-draft snapshot is preserved and there is no extra post-answer fetch. Native `CitationResolver`/`sources(in:)` and `ReferenceScanner` also expose legacy plain references, which are always shown **unchecked**; wire and cache enums are unchanged. |
| 3 | Fragmented actions | One section holds Sources, Copy and status. Sources are collapsed by default; the full passage sheets and 44pt targets remain. The selection-like inline highlight is gone. |
| 4 | Lists | `MarkdownBlockParser` handles ordered, nested and `+` bullets, with list spacing distinct from paragraph spacing. Streaming tails are parsed safely so unfinished link/list syntax is not shown as raw control text. |
| 5 | Streaming follow | Following is driven by scroll geometry: browsing up preserves the reading position, and returning to the bottom resumes following. |
| 6 | Carousel | Swipes are short and non-bouncy and move exactly one card. Reveal is quiet, and text on neighboring cards is hidden. |
| 7 | iPad measure | Assistant answer column is capped at 640pt. |

**Found during local QA, not in the original audit:** at the largest accessibility text size the layout failed in four ways, all fixed in source:

- **Keyboard overlap (iPad):** the keyboard covered the composer and Send. The composer now keeps its intrinsic height (at least 44pt, maximum 3 accessibility lines) above the keyboard, and the Send/Stop symbols are bounded. Home scrolls when space is constrained.
- **Welcome prompts behind the composer:** the home heading and prompts are absent while the composer is focused.
- **Sidebar crowding:** navigation, search and history scroll together; rows use intrinsic text height, icons are a fixed 20pt, account text wraps, and the decorative wordmark is capped at xxxLarge. The accessibility iPad sidebar is ideal 340 / max 400 wide and the phone drawer grows up to 360.
- **Footer collision:** the account footer collided with rows at accessibility sizes. At those sizes only, it now sits inside the sidebar's scroll view.

### Local verification, 2026-11-16 (separate from the 2026-11-15 released-source results)

Simulator-only (iOS 27.0), serial, on the reused iPhone 18 Pro and a temporary iPad Pro 11-inch (M5) that has since been deleted. All evidence is in [ios/Verification/calm-ui/](../ios/Verification/calm-ui/). Fixture chat answers are synthetic labelled fixtures, not model replies.

| Check | Result | Evidence |
|---|---|---|
| Foundation-only core tests (unchanged since) | 184 passed, 0 failures | [core-tests.log](../ios/Verification/calm-ui/core-tests.log) |
| Backend: lint, typecheck, Vitest, source/resource check | Lint and typecheck passed; 380 passed, 4 skipped (27 files); 179 canonical cards valid. The source check does not compile Swift | [backend-checks.log](../ios/Verification/calm-ui/backend-checks.log) |
| Full iPhone run (app unit + UI) | 65 passed, 0 failed, 1 skipped (66): 50 app unit + 15 UI, plus 1 iPad-only case skipped | [iphone-final-summary.json](../ios/Verification/calm-ui/iphone-final-summary.json) |
| Full iPad UI suite | 16 passed, 0 failed, 0 skipped | [ipad-ui-summary.json](../ios/Verification/calm-ui/ipad-ui-summary.json) |
| iPhone check after footer move | 54 passed (50 app unit + 4 UI) | [iphone-accessibility-check-summary.json](../ios/Verification/calm-ui/iphone-accessibility-check-summary.json) |
| iPad check after footer move | 4 UI passed | [ipad-accessibility-check-summary.json](../ios/Verification/calm-ui/ipad-accessibility-check-summary.json) |
| Account-visibility proof | iPhone 1 passed; iPad 1 passed | [iPhone](../ios/Verification/calm-ui/iphone-account-proof-summary.json), [iPad](../ios/Verification/calm-ui/ipad-account-proof-summary.json) |
| Local harness replay | HTTP 200; 4 plain references normalized to links, all `not_fetched`; no provider, database or auth calls | [local-harness-replay.json](../ios/Verification/calm-ui/local-harness-replay.json) |
| Source manifest | 81 non-secret file hashes; the verified source includes the current test file hash | [source-manifest.json](../ios/Verification/calm-ui/source-manifest.json) |
| Adversarial citation review | Passed | Review result, no saved artifact |

**What each run covers.** Both full runs (iPhone 65/0/1, iPad 16/0/0) precede only one change, the accessibility-size footer placement. The two post-change checks cover the accessibility sidebar, accessibility composer and source sheet, normal navigation and the normal account row; they are focused re-runs, not new full suites. A last test-only change (no app code) replaced an unreliable `isHittable` assertion, which misreported the off-screen Account row, with a frame-containment check: the sidebar frame must contain the account frame, the test physically taps Account and asserts the Free access sheet. Both account proofs passed. The actual visible-account captures are [iphone-accessibility-account-visible.jpg](../ios/Verification/calm-ui/iphone-accessibility-account-visible.jpg) and [ipad-accessibility-account-visible.jpg](../ios/Verification/calm-ui/ipad-accessibility-account-visible.jpg); the older `*-sidebar-account-checked.jpg` files are superseded duplicates.

**Independent visual review (Opus, actual screenshots).** Normal iPad, 8 screens: pass. Normal iPhone, 7 screens: pass. Final accessibility stills, both devices: pass. The footer collision is resolved, and the reviewer read the last two visible-account captures and confirmed the Account row fully visible and uncrowded.

**Design checkpoint (hallmark / deslop-law).** Scored P5 H4 E4 S5 R5 V4. The brand mark, system fonts and ChatGPT-style layout are user-directed and kept, as is the glass material. There is no ambient motion, fake content or new design system. This is a design review of the stills, not an accessibility certification.

**Remaining non-blocking observations:**

- A long flashcard answer ends at the scroll boundary, and the scroll-indicator flash was not validated in motion.
- iPad shows a wider peek of neighbouring cards.
- Ordinary sidebar rows can be clipped at the viewport's scroll boundary.

**Explicit limits.**

- The still screenshots do not prove motion. The two `.mp4` files (`iphone-calm-motion.mp4`, `iphone-calm-interactions.mp4`) are actual simulator recordings from an earlier run that predates the final accessibility layout edits. No frame-rate, battery or scrolling-performance measurements were taken.
- The iPhone keyboard-up state was not reliably shown in the last captures, so the full keyboard matrix is not claimed.
- Not verified: a full VoiceOver audit, a flawless-accessibility certification, physical iPhone/iPad, native sign-in, pre-iOS-26 material fallbacks, and the live model service through the native UI. Local replay used a local HTTP fixture with no real provider, database or authentication.

**Release and cleanup state at the end of the local pass (historical).** Nothing had yet been committed, pushed, deployed to the backend or submitted to TestFlight, and no authentication or paywall was activated. Uploaded 0.1.0 (1) does not contain these fixes. Cleanup receipts ([cleanup.json](../ios/Verification/calm-ui/cleanup.json), [test-product-cleanup.json](../ios/Verification/calm-ui/test-product-cleanup.json)): the temporary iPad was deleted, the reused iPhone 18 Pro was shut down, an unrelated booted iPhone 17 was untouched, all 16 task result bundles and completed test products were removed after export, and both preview servers were stopped with task launch entries removed. Retained: the shared DerivedData (about 1.0 GiB), the `calm-ui/` proof (318 MiB), and the prior release archive, IPA and source snapshot, untouched.

## Release follow-through, 2026-11-16

This supersedes the local-only statements above. The original audit and the 2026-11-15 and local-pass receipts are unchanged historical records.

- **Shipped.** The calm-reading fixes were committed with the backend (`d167cac`), merged with latest `main` as `a9aec36` and pushed. [GitHub CI](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/actions/runs/43806984409) passed and production [sholam.vercel.app](https://sholam.vercel.app) is READY on `a9aec36` (`dpl_A8TP2KrTyLzPGtVPGpojbQ72guYd`). Signed **0.1.1 (2)** was Apple-validated, uploaded and processed VALID ([App Store Connect](https://appstoreconnect.apple.com/apps/6834994638/testflight/ios)) and added to the existing External Beta group.
- **Release-gate verification fixes.** First/I John versus Gospel-of-John identity, formatted book labels, compact Roman numerals and unsupported compound ordinals. A numeric label is verified only when a complete canonical parse remains after emphasis is removed; unknown annotated or translated numeric labels stay unchecked; opaque labels without numbers keep target-lookup semantics.
- **Results.** Server 411 passed / 4 skipped; lint, typecheck, 179-card seed and production build passed; core 198; app unit 50 + 3 citation UI = 53. An initial focused UI run was 52 passed / 1 failed on an unexpected drawer; the unchanged UI test passed standalone on retry and the final run was 53 passed. The failure capture is kept as a limitation: full stability is not claimed.
- **Opus review scope.** The existing Opus review still applies to the unchanged UI. There is no fresh Opus review of 0.1.1 (2).
- **Submission state.** 0.1.1 (2) is READY_FOR_BETA_SUBMISSION and **no Beta App Review submission exists**; 0.1.0 (1) remains WAITING_FOR_REVIEW, untouched. Submission is deliberately held because production chat returns the public provider error "OpenRouter rejected the API key". That is a provider authentication rejection needing an owner check of `OPENROUTER_API_KEY` in [Vercel Production](https://vercel.com/owenisas-projects/sholam/settings/environment-variables), a redeploy, a chat verification and then submission of the existing build. It is blocked owner input, not a completed submission, and the build is not available to external testers.
- **Still not verified.** Physical devices, a full VoiceOver audit, pre-iOS-26 fallbacks, native sign-in, motion performance, and the live model through the native UI. Native sign-in and billing stay off.
- **Cleanup (complete, confirmed 2026-11-16).** Removed this release's three Release 0.1.1 `.xcresult` bundles, their three completed MCP test-product directories, its own `tmp` root and `EnvCheck` (public link metadata only). No new simulator was created; the iPhone 18 Pro was reused and is shut down, and the unrelated iPhone 17 was untouched. Retained: the shared DerivedData cache (about 1.1 GiB) and the release folder (about 192 MiB: prototype and final signed archives and IPAs, failure and pass proof, logs, verifier). Build 1 provenance is untouched.
- **Provider authentication unresolved.** The exact public error is the SSE authentication rejection "OpenRouter rejected the API key". There is no saved local key and the child-environment validation yielded no usable key, so the cloud key's format and expiry are not proven and a revocation is not claimed. No credential or model-routing change was made. `autoNotifyEnabled` reads true (Apple's default), and no individual invites or manual notifications were sent.
- Receipts: [ios/README.md](../ios/README.md#testflight-release-011-2). Raw proof is operator-local and gitignored.

## Provider recovery and submission, 2026-11-18

The November 16 provider block above is resolved. The owner supplied a replacement credential; it passed OpenRouter authentication and was installed through stdin in Vercel, with no credential value written to a file or the repo. The same production snapshot was redeployed, not a new native binary. The real Swift client completed a live turn in 13.1 seconds with both John 3:16 and 1 John 3:16 fetched and separately verified, no unverified references or quote warnings. A fresh browser question fetched Psalm 23:1, rendered an answer and completed with final citations and `done`.

Apple now reports 0.1.0 (1) APPROVED and IN_BETA_TESTING. The already uploaded 0.1.1 (2) was submitted on November 18 and is WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW. Reviewer notes no longer describe the resolved outage. This completes the previously approved submission; Apple approval of the updated build is still pending. The public link, 100-tester cap, free-only model route, disabled native sign-in and billing remain unchanged. No new Opus UI audit, physical-device run or native build is claimed.

## Focused flashcard cleanup, 2026-11-18 (initial source-only record)

This section preserves the initial source-only result. The completed verification and external-beta upload below supersede its unrun/unuploaded statements.

The owner approved the focused flashcard cleanup and separately identified uneven spacing around the iPad's selected Flashcards label. The pre-change audit used release-matched iPhone/iPad captures from `ios/Verification/calm-ui/`; those captures are **before evidence**, not proof of this cleanup. Its consolidated punch list was 0 critical, 4 major and 2 minor: redundant chrome, an overly flat front, unclear answer overflow, a heading-like chat action, short-question placement and a filter-like saved-copy status.

### Applied in source

- Removed the sidebar's **All chats** destination. The sidebar still lists and searches conversations and opens saved threads. It now contains the guest-storage disclosure and the conditional guest-import prompt/result, so removing the destination does not orphan that future signed-in affordance. Failed opens keep the drawer visible with the error; only a successful, still-current open closes it. The underlying history screen, account isolation and native sign-in gate remain intact.
- Removed the permanent **Refresh cards** toolbar item. Cache-aware refresh runs at startup, on entering Flashcards and on foreground return while Flashcards is selected. An in-flight public-deck update is not cancelled by leaving the screen, preventing rapid re-entry from losing its refresh. A contextual **Try again** action appears only with an update error, bypasses the freshness cache and disables while running. An earlier failed refresh cannot be silently cleared just because the saved copy is under an hour old.
- Replaced the iPad's equal-width segmented picker with intrinsic-width mode buttons: each label has 16pt horizontal insets, at least a 44pt target and a shared 4pt outer inset. Selection changes fill and ink colour, not font weight or width. The rail is 44pt at standard text size, with the selected surface inset vertically rather than adding height to the toolbar. A native menu is used at accessibility text sizes and as the constrained-width fallback. Reduce Transparency uses a solid rail.
- Short questions rest 40% of the spare reading height from the top. Long questions still start at the top and scroll; card geometry and action positions do not depend on question length. Both faces use the same named 12pt category/question gap and action spacing; notes have one 12pt gap, not stacked padding plus stack spacing.
- Kept the dense blue backing for white-text contrast and added restrained directional surface sheen and an inset lip. No halo, shadow, ambient motion or new flip was added. Reduce Transparency and increased-contrast paths retain dense surfaces.
- Long answers show **Scroll to read more** only when measured content overflows and more remains below. The cue occupies a separate slot, not a mask over teaching text; its slot stays reserved at the bottom to avoid moving the reader's text. Its geometry works independently of `onAppear`, including the initially hidden back. At accessibility sizes, actions still scroll after the content.
- Both card kinds now use **Ask Shalom** with a chat glyph in blue, distinct from amber teaching headings. The explicit-tap and repeat-send guards are unchanged.
- Saved-copy status is quiet icon/text, not another filter capsule. It says **Saved on this device**, not a claim that the network is offline. Failure copy distinguishes an available saved deck from an empty one.

### Verification and limits

- Swift syntax parsing passed for all changed app/test sources. This is **not Swift type-checking or compilation**.
- XcodeGen generation and native source/resource checks passed; the generated project includes `CardLayoutTests`. All 179 canonical cards, provenance, licensing, privacy and billing/auth-off defaults are unchanged.
- TypeScript typecheck and Biome passed. Focused native-contract tests: 10 passed. Full Vitest suite: 411 passed, 4 skipped, 27 files. Seed validation: 50 fact cards and 129 discover cards valid. These do not execute SwiftUI.
- Authored five card-overflow metric tests, direct Ask-label tests, an iPad mode-inset UI regression and sidebar saved-history/search regressions. **Native unit/UI tests have not run for this cleanup.**
- Source palette bounds: status ink on sky 4.86:1; blue chat action on the two paper palettes at least 7.52:1; white front text with the worst white backdrop and maximum new sheen at least 4.80:1. These are palette calculations, not certification of rendered native material pixels.

**Independent source review:** correctness and design reviewers checked the combined diff. Follow-through preserved the import affordance in the sidebar, kept failed-open errors visible, removed the screen-task cancellation/re-entry race, corrected empty-deck status copy and doubled notes spacing, and changed the mode test to use button bounds rather than assuming a nested Text accessibility element exists. The mode rail no longer adds 8pt of layout height, and accessibility sizes explicitly use the native menu. Per-frame scroll measurement cost and the appearance of the two subtle front-edge highlights remain native-run observations to check, not proven performance or visual defects. No new independent post-fix visual pass is claimed.

**Design checkpoint (source only):** Hallmark P4 H4 E3 S4 R4 V3. The deslop-law check retains the user-directed native system typography, sky/cross-cloud, glass and restrained motion rather than introducing a web theme. Named tokens, deliberate label insets, unmasked teaching text, no new shadows/halos, separate status versus filters and explicit action semantics are source-checked. Execution is provisional: pixel centering, glass quality, focus behavior and the responsive/accessibility matrix require a fresh native run. No 58/58 visual pass or flawless UI claim is made.

A fresh native build, updated screenshots, iPhone/iPad visual review, largest Dynamic Type, VoiceOver, menu fallback and pre-iOS-26 rendering remain unverified. Free disk is below the normal 100 GiB gate; prior one-run testing/archive exceptions are not reused. No simulator or native build was started, no proof/archive was deleted, and no new large artifacts were created. At the end of this initial source-only pass, the cleanup was uncommitted and absent from uploaded TestFlight binaries. The later release below supersedes that state.

## Release follow-through: 0.1.2 (3), 2026-11-18

The owner approved external TestFlight release and a fresh bounded native test/archive exception: 10 GiB of new artifacts, a 40 GiB free-space hard stop, serial tests and one shared DerivedData. This was not a reuse of old exceptions. A continuously checked budget receipt is retained with the release. The temporary 11-inch iPad was retired after QA and replaced, one at a time, by a 13-inch device for genuine App Store-size captures.

### Runtime findings fixed before archive

- Overflow measurements stayed at defaults in the first run, so the cue did not appear. Preference reduction now ignores default empty values and observers live inside the GeometryReader content. The normal and largest-text tests prove that the cue appears and the measured more-below state clears at the bottom.
- Inactive front/back scroll views remained in the accessibility tree despite opacity. The carousel now instantiates only the active face, retaining a short opacity transition. Swipe and repeat-Ask guards are unchanged.
- Largest-text header truncation was removed: the long “From Shalom Guide” row falls back to a compact Full deck control, saved status says Saved cards, and the cue says More below at accessibility sizes.
- Filtered iPad history rows disappeared from the lazy subtree with search focused. A stable stack and explicit Search submission/dismissal preserve row access. The test uses the saved chat's identifier across relaunch, checks the exact search result and opens the original stored answer/citations.

### Final verification

| Check | Result |
|---|---|
| Native simulator compile | Succeeded |
| Foundation core | 198 passed |
| Final full iPhone app unit + UI | 73 passed, 0 failed, 2 iPad-only skips |
| Full iPad UI before last history fix | 18 passed, 1 history failure retained |
| Saved-history test after final fix | 1 passed |
| Final focused iPad regression (normal navigation, accessibility sidebar, mode geometry, cards, normal/largest answer scrolling) | 6 passed |
| Genuine 13-inch iPad home/card/mode capture checks | 3 passed |
| Backend source checks | Typecheck/lint passed; Vitest 411 passed, 4 skipped; 179 cards valid |
| Live actual Swift-client probe | Completed in 23.7 s; John 3:16 and 1 John 3:16 independently fetched/checked, no quote warnings; guest privacy and invalid-Bearer 401 passed |
| Signed archive / IPA | Exact frozen source/resources and distribution identity checked; billing off, sign-in disabled, no products or DEBUG fixtures; Apple VERIFY SUCCEEDED; processing VALID |

Failed diagnostic runs and their attachments are retained separately, not counted as successful tests. Screenshots are actual simulator captures, not physical-device proof or performance measurements. Main inspected final iPhone front/back/home and iPad normal/largest card captures; a separate reviewer checked the iPhone store candidates. No complete VoiceOver audit, physical-device run, pre-iOS-26 matrix or frame-rate/battery certification is claimed.

### External release and preparation

**0.1.2 (3)**, build ID `37d9c1e5-ebfd-4754-8d0a-ee2e5f7ea371`, is in the existing External Beta group and was submitted at `2026-11-18T04:43:55Z`. Apple read-back is **WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW**, not external availability. Older builds, the public link and the 100-tester cap remain unchanged. Existing signing identity reused, no credentials created; native sign-in/billing remain off. Nothing was committed, pushed or redeployed to the backend.

The exact 95-file native snapshot is based on `57b6913` plus the uncommitted changes, with manifest SHA-256 `8ed17fd5ffebfafcf28b7b144ed11045d2465f36961ef27f714cd8dc047bfc38`. Source, verification logs, screenshots, failed/pass summaries, signed archive/IPA and sanitized Apple receipts remain operator-local in `ios/build/TestFlight-0.1.2-3/`. See [release receipt summary](../ios/README.md#testflight-release-012-3).

**Cleanup completed:** exported proof and signed binaries retained; all 15 new result bundles, 14 completed MCP test-product directories and this run's temp root removed. Both task-created iPads deleted, reused iPhone shut down, unrelated devices untouched. Conservative monitored peak 7.75 GiB under the 10 GiB cap; free disk approximately 92 GiB. Shared DerivedData about 1.1 GiB and release proof/binaries about 835 MiB remain.

The [App Store preparation pack](../ios/AppStore/SUBMISSION.md) contains draft English metadata and six opaque native screenshot candidates at required iPhone-medium and 13-inch iPad sizes. It does not claim a public App Store submission. The in-app changes below follow this release; public privacy/support surfaces, final privacy labels, provider retention and age/legal/contact decisions remain explicit gates.

## Privacy readiness fixes, 2026-11-18 (unreleased)

The owner approved applying the in-app readiness fixes, then separately approved one bounded native verification run: at most 8 GiB of new artifacts, hard stop below 40 GiB free, shared DerivedData, serial tests, one temporary iPad and **no archive or upload**. This source is not in the already uploaded 0.1.2 (3) IPA; its frozen release provenance is unchanged.

### Applied and reviewed

- `ChatViewModel.send` checks versioned, environment/account-scoped consent before changing history or starting transport. Typed prompts, suggestions and Ask Shalom all use it. Missing consent preserves the question as a draft and opens a disclosure; Allow records permission but does not send. Decline and interactive dismissal grant nothing. Permission is reloaded on send and the scheduled transport checks it again before calling the API.
- Consent names Shalom, OpenRouter, the downstream model provider, shortened recent context, rate-limit/hosting metadata and retention/training uncertainty. It avoids zero-retention promises. Offline Privacy Details are available before agreeing and in Account. Reading saved chats or using cards does not itself send an AI request.
- Account revocation cancels an active stream and gates future sends. Confirmed guest-history deletion clears the local cache and draft, not the public deck or remote/provider records. Invalidation work is tracked and serialized; a deletion revision suppresses stale guest-preservation writes, and deletion clears the captured guest scope even during an account transition. A regression checks overlapping preservation/deletion.
- Report prepares a deterministic preview without answer text by default. The user can include/exclude only the selected answer, inspect the exact text, then explicitly copy or open the OS share chooser. No report is auto-uploaded, mailed or claimed received. Copy is local-only and expires after ten minutes. An included answer may repeat personal material from the question, which is disclosed.
- Public privacy/support URL slots accept HTTPS without URL credentials and are empty by default. Offline facts are not labelled an approved legal policy. No contact was invented; a missing support destination is shown before export actions. A real recipient/triage process remains a public-release gate.
- Removed inactive native EmailAddress/UserID collection declarations while native sign-in is off. OtherUserContent stays conservatively linked for app functionality. Final App Store privacy answers and future account deletion/manifest changes are not inferred from guest mode.

Independent source review initially found a guest-preservation/deletion race and a stale history spinner; both were fixed before verification. Final review found no unresolved privacy bypass/race or false-success defect, with retention/contact facts explicitly outside its certification. Additional wording was tightened so local history storage is not confused with a promise that sent content stays on the device.

### Verification

| Check | Result |
|---|---|
| Native compile / app unit tests | 71 passed, including consent defaults/scope/revision, no-send-on-Allow, cancellation, deletion barriers and report defaults/bounds |
| Full iPhone app unit + UI | 93 passed, 0 failed, 2 iPad-only skipped |
| Latest focused iPhone model/Account/navigation check | 75 passed (71 unit + 4 UI), after final privacy wording and Account form identifier |
| iPad privacy UI | First pass 5 passed / 1 harness failure; corrected Account scroll target re-run 2 passed, covering revoke and deletion/relaunch |
| Largest accessibility consent | Passed on iPhone and iPad; both choices reachable without sending |
| Report inclusion and native chooser | Final extended iPhone check passed: default excluded, explicit switch adds answer, switching off removes it. After Share, the accessibility tree contains `ShareSheet.RemoteContainerView` and the report caption; no recipient chosen. The screenshot precedes full remote-sheet rendering, so it is not visual certification of the OS chooser |
| Repository | Typecheck/lint passed; Vitest 411 passed, 4 skipped; 179 canonical cards unchanged; source/resource/config checks passed |

The iPad failure was a test gesture aimed at the app rather than the half-height Account Form; it now scrolls `account-form`. Extended report diagnostics initially tapped the semantic switch row label; the final test targets the actual nested native switch. Failed summaries/attachments are retained and not counted as passes. The full iPhone run predates only final wording/identifiers and the extended report test; focused final checks cover those changes.

Actual simulator proof, summary JSON, failure proof, budget and verified-source hashes are operator-local under `ios/build/PrivacyReadiness/`. Main inspected consent/report/deletion views and a correctly oriented iPad consent capture. No physical-device run, full VoiceOver certification, pre-iOS-26 matrix, provider-retention certification or report delivery is claimed. No production model calls, auth email, StoreKit request, public policy publication, Apple metadata write, new upload, commit or push occurred during this pass.

**Cleanup complete:** all 11 new result bundles and 11 completed MCP test-product directories were removed after summaries and attachments were exported. The sole temporary iPad was deleted and the reused iPhone shut down; unrelated devices and older release archives/proof were untouched. Retained: shared DerivedData about 1.1 GiB and this privacy QA/proof about 156 MiB. Conservative monitored peak was 4.87 GiB under the approved 8 GiB cap; free disk ended around 92 GiB. The budget monitor is stopped. Verification-state/source hashes are preserved separately from 0.1.2 (3), whose IPA SHA-256 still matches its release receipt.

Proof samples: [iPhone consent](../ios/build/PrivacyReadiness/proof/consent-iphone.jpg), [iPad consent](../ios/build/PrivacyReadiness/proof/consent-ipad.jpg), [large iPad choices](../ios/build/PrivacyReadiness/proof/large-consent-ipad.jpg), [deleted guest history](../ios/build/PrivacyReadiness/proof/deleted-history-iphone.jpg), [report draft](../ios/build/PrivacyReadiness/proof/report-draft-iphone.jpg). These are operator-local QA captures, not App Store marketing screenshots.

**Design checkpoint:** Hallmark P4 H4 E4 S4 R4 V3, component scope. Native system typography, readable scrolling Forms, 44pt controls, quiet report actions and explicit state/result copy are retained. The deslop-law check added no theme, glow, fake statistics, decorative motion or fabricated support success. This is verified simulator UI, not a 58/58 web audit or flawless-accessibility claim.

## Release verification: 0.1.3 (4), 2026-11-18

The owner requested releasing the updated app to TestFlight and approved a **fresh** bounded test/archive/upload exception: at most 10 GiB new artifacts, a 40 GiB free-space hard stop, one shared DerivedData directory, serial XCTest and at most one temporary iPad. Earlier completed exceptions were not reused. The new candidate includes the privacy/readiness source above, the approved support email and the now-published HTTPS policy/support URLs. Sign-in and purchasing remain off.

### Findings resolved before signing

- A normal Release-simulator check found that the center of the Account row did not activate it. Its label now has an explicit rectangular content shape covering the row. The Account regression taps the normalized center and requires the actual `account-form`; the former check could match Free access in the still-open sidebar instead of proving that settings opened.
- The first focused iPad run passed seven checks and stopped at the report preview's immediate `exists` assertion. The preview was below the lazy Form's visible area. The test now scrolls that Form, waits for the preview and returns the switch fully into view before toggling it. Only test code changed for this finding; the report implementation was not changed. The final iPad set and an iPhone report rerun passed. Initial failure summaries and all available attachments remain in the release evidence.
- An independent source review found no unresolved consent bypass, post-revocation send, local-history resurrection, automatic report disclosure or unsafe support-link defect. Its first worker failed on a provider limit; the explicit retry completed. Runtime tests and manual checks, not the source review alone, establish the results below.

### Final verification

| Check | Result |
|---|---|
| Foundation core | 198 passed, 0 failures |
| Full iPhone app unit/UI, after Account correction | 94 passed, 0 failed, 2 iPad-only skipped |
| Final iPad subset | 8 passed: sidebar/mode geometry, Account center tap, consent decline/grant/revoke, local deletion/relaunch, report opt-in/export and largest consent actions |
| Report test after the test-only scroll correction | Passed on iPad and in a focused iPhone rerun; shipping app source unchanged from the final full iPhone run |
| Release-simulator public configuration | 0.1.3 (4), correct API/policy/support/email, auth disabled, billing false, no DEBUG fixture marker |
| Real external links | Actual Release link actions opened both published pages in Safari; main inspected the resulting captures |
| Live Release chat | First Send opened disclosure without sending; Allow retained the draft; a second deliberate Send completed a real answer to “What does John 3:16 mean?” Sources showed John 3:16 looked up before answering and John 3:3–8 / John 3:17 explicitly not checked |
| Shared repository | Typecheck/lint passed; Vitest 415 passed / 4 skipped; 50 fact + 129 Discover cards valid |
| Signed artifact | Exact app/team/certificate/profile, version/build, resources including privacy manifest, distribution entitlements, free/auth-off configuration and absence of DEBUG fixtures checked in archive and IPA |
| Apple server validation | VERIFY SUCCEEDED with no errors |

The final source snapshot has 101 files, based on `e82dcf8` plus the uncommitted native working tree, not that commit alone. Its manifest SHA-256 is `9dc82e3a9a2df0a0e5c0b387cb28a25d10596d8e341270b9bd160a4c2b601ba5`. Earlier snapshots before the Account and test-scroll corrections remain separately preserved. Signed IPA SHA-256: `1cf86bbf5091d8f6dbc7ae0548961af0bb4f510e0b5f5f19bc2638c5b16cf7d4`, 4,282,285 bytes. Final distribution state and cleanup are recorded in [the native release record](../ios/README.md#testflight-release-013-4) and operator-local `ios/build/TestFlight-0.1.3-4/` receipts.

Proof samples: [native support contact](../ios/build/TestFlight-0.1.3-4/iphone-release-help-contact.jpg), [policy opened in Safari](../ios/build/TestFlight-0.1.3-4/iphone-release-policy-opened.jpg), [support opened in Safari](../ios/build/TestFlight-0.1.3-4/iphone-release-support-opened.jpg), [live answer](../ios/build/TestFlight-0.1.3-4/iphone-release-live-answer.jpg), [iPad report preview after exclusion](../ios/build/TestFlight-0.1.3-4/ipad-final-report-excluded.jpg). These are QA captures, not newly prepared App Store marketing screenshots.

Limits remain explicit: no physical-device/TestFlight installation, full VoiceOver or older-OS matrix, legal/privacy-label certification or email delivery/triage test. The large-text captures are scrolled states, not proof that every control is simultaneously visible. No report/email was sent and no StoreKit interaction, native sign-in activation, public App Store submission, legal acceptance or Git commit/push occurred in this release verification. The temporary iPad and all five raw result/MCP test-product pairs were removed after proof export; the reused iPhone was restored to its initial app-not-installed and shutdown state. The disk-monitor measurement gained bounded, fail-closed retries after one transient scan failure; its original baseline and 10/40 GiB limits were not reset.
