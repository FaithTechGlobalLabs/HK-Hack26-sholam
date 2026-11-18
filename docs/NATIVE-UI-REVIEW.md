# Shalom native UI review: Opus

Last updated: 2026-11-18

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
