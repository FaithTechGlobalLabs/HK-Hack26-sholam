# Shalom for iPhone and iPad

Last updated: 2026-11-19

Native SwiftUI Shalom, alongside the Next.js website. **Every feature is free. Paywalls and purchasing are disabled.** This is not a WebView wrapper.

## Status: 0.1.3 (4) submitted for external review

**Last Apple check (2026-11-18):** the privacy/readiness update is signed, Apple-validated, uploaded and processed VALID as **0.1.3 (4)** in the existing External Beta group. Beta App Review was submitted at `2026-11-18T14:31:38Z`; Apple reports **WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW**. The new build is not yet available to external testers. All earlier builds remain valid and unexpired. See [TestFlight release: 0.1.3 (4)](#testflight-release-013-4).

**0.1.0 (1)** is now **APPROVED** and **IN_BETA_TESTING** for external testers. It was not expired or withdrawn. The [existing public invitation](https://testflight.apple.com/join/urQsNaGH) and 100-tester cap remain unchanged.

The native-compatible backend and support/privacy website are deployed. The 2026-11-19 source-publication change tracks the native app, tests and preparation documents after checking every one of the 101 frozen native inputs against the uploaded 0.1.3 (4) snapshot. At upload time, those inputs were an uncommitted working tree based on `e82dcf8`; the original snapshot and release receipts retain that provenance rather than retroactively assigning the IPA to a later commit. Source publication does not create another TestFlight build or change the uploaded binary. Native sign-in and billing remain off. No purchases, products, migrations, legal acceptance, public App Store submission, individual invitations or manual notifications occurred. Authentication defaults and private reviewer contacts were not changed.

## UI audit

The owner requested an Opus review of motion and response formatting on 2026-11-16. The [canonical native UI audit](../docs/NATIVE-UI-REVIEW.md) records the findings, the local fixes applied afterwards and the evidence limitations.

**Calm-reading fixes (2026-11-16).** The audit was applied, and the fixes ship in build 0.1.1 (2) and the deployed backend (they were local-only until the commit described below): static sky `Canvas`; short, non-bouncy, one-card carousel swipes with a quiet reveal and hidden neighbor text; one Sources / Copy / status section with collapsed sources and full passage sheets; a 640pt answer maximum; ordered, nested and `+` bullet parsing with safe streaming tails; geometry-driven follow that preserves browsing and resumes at the bottom; and legacy plain references shown as always unchecked. Accessibility-size layout was also fixed: the composer keeps its height above the keyboard, home prompts hide while the composer is focused, and the sidebar scrolls as one list (intrinsic-height rows, fixed 20pt icons, wrapping account text, footer inside the scroll view at accessibility sizes, iPad 340 ideal / 400 max, phone drawer up to 360). The server also normalizes supported English plain references into `verse:` links for display only; raw model and history blocks stay verbatim.

**Build 0.1.0 (1) does not contain these fixes; 0.1.1 (2) does.** The follow-through (commit, deployment, signed upload) is recorded in the 0.1.1 (2) section below; the figures that follow were captured before it and are kept as the original local record.

Local results ([Verification/calm-ui/](Verification/calm-ui/), simulator only, synthetic fixtures): core 184 passed; backend 380 passed / 4 skipped with lint, typecheck and a 179-card source check; full iPhone run 65 passed / 0 failed / 1 iPad-only skipped (50 app unit + 15 UI, [summary](Verification/calm-ui/iphone-final-summary.json)); full iPad UI 16 passed ([summary](Verification/calm-ui/ipad-ui-summary.json)). Both full runs precede only the accessibility-size footer move; focused re-runs afterwards passed (iPhone 54, iPad 4, plus one account-visibility proof each). An independent visual review of the actual screenshots passed. The [audit](../docs/NATIVE-UI-REVIEW.md#local-verification-2026-11-16-separate-from-the-2026-11-15-released-source-results) holds the full table, non-blocking limits and cleanup receipts.

Not verified: motion beyond two earlier simulator recordings, the iPhone keyboard-up matrix, a full VoiceOver audit or accessibility certification, physical devices, native sign-in, pre-iOS-26 fallbacks, and the live model through a physical native UI. The production Swift-core and browser probes passed on November 18; they do not constitute a physical-device UI run.

### Focused flashcard cleanup: local source, 2026-11-18

A subsequent owner-approved cleanup was initially source-only, then verified and uploaded as **0.1.2 (3)** on November 18; 0.1.0 (1) and 0.1.1 (2) do not contain it. At upload time, source was uncommitted, with a hashed release snapshot preserved. It removes All chats and the permanent Refresh toolbar control, retains sidebar history/search and cache-aware automatic refresh with contextual retry, gives the iPad Chat / Flashcards labels matching insets, improves short-question placement and the blue surface lip, adds a measured long-answer scroll cue and makes Ask Shalom an explicit chat action. Saved-copy status is quiet text, not a filter-like capsule. Teaching text, account privacy, calm motion and free-access gates are unchanged.

Syntax parsing, XcodeGen/source-resource validation, typecheck, lint, 179-card validation and all 411 Vitest tests passed (4 skipped). The owner then approved a fresh bounded test/archive run. Final native results: 198 core tests; iPhone 73 passed, 2 iPad-only skipped; final iPad focused checks 6 passed plus a saved-history regression pass; genuine 13-inch iPad capture checks 3 passed. Runtime findings were fixed before archive. See the [canonical cleanup record](../docs/NATIVE-UI-REVIEW.md#release-follow-through-012-3-2026-11-18) for failures retained, final verification and limits.

## Unreleased privacy/readiness fixes, 2026-11-18

This is the initial local-stage record, retained for provenance. The owner approved applying the in-app App Store readiness fixes after 0.1.2 (3); that first pass did not archive, upload, commit or push them. The fixes and published support/privacy URLs are now included in the separately authorized [0.1.3 (4) TestFlight release](#testflight-release-013-4). The already uploaded 0.1.2 (3) binary and its source snapshot remain unchanged.

- Consent is denied by default and scoped to API environment, account/guest and disclosure version. Every chat send path, including suggestions and Ask Shalom, checks it before history mutation or transport. Allowing only records permission; the question stays as a draft until a deliberate second Send. Declining/dismissing grants nothing; cards remain accessible.
- Offline Privacy Details name Shalom, OpenRouter and its selected provider, limited recent-chat context, rate-limit/hosting metadata and retention/training uncertainty. Account can revoke permission, stopping an active answer and blocking future sends.
- Confirmed Delete local chats clears the guest cache and unsent draft, drains late writes/account-transition preservation and leaves the public deck untouched. This does not delete server/provider copies or an account.
- Report creates a preview with answer text off by default; inclusion is an explicit choice. Share opens the OS chooser, never auto-sends, and does not claim receipt. Copy is device-local with a ten-minute expiry. Without a configured support contact, the view explicitly says Shalom cannot receive the draft.
- `SHOLAM_PRIVACY_POLICY_URL` and `SHOLAM_SUPPORT_URL` are optional, HTTPS-only public configuration and empty by default. The owner subsequently approved `owenisas@gmail.com` as the public support email; `SHOLAM_SUPPORT_EMAIL` supplies it to a displayed address and user-tapped mailto link with a static subject only. Reports are not automatically attached or sent. A future HTTPS support page takes precedence over the email action; the email is not a substitute for Apple's web Support URL. This contact-only follow-up passed syntax/source checks but was not rebuilt or visually re-tested. Offline facts are not a legally reviewed public policy. The inactive EmailAddress/UserID manifest entries were removed; OtherUserContent remains conservatively linked. Revisit the manifest/account deletion before enabling sign-in.

Native results: 71 app units; full iPhone 93 passed / 2 iPad-only skipped; latest focused model/Account check 75 passed; iPad privacy and corrected deletion/revocation checks passed; extended report inclusion and OS share-container checks passed. Screenshot proof and exact limits are in the [privacy QA record](../docs/NATIVE-UI-REVIEW.md#privacy-readiness-fixes-2026-11-18-unreleased). The [submission pack](AppStore/SUBMISSION.md) keeps remaining gates explicit: public policy/support contacts and delivery, provider retention, final privacy/age/legal/contact answers, and a newly verified/uploaded build. The existing screenshot candidates are from 0.1.2 (3) and are not proof of the new privacy UI. Cleanup is complete: the temporary iPad and 11 result bundles/11 completed test products were removed after proof export, the reused iPhone is shut down, and the monitor stopped. Shared DerivedData (~1.1 GiB) and privacy QA evidence (~156 MiB) remain; earlier signed release artifacts are untouched.

## TestFlight release: 0.1.3 (4)

- **Apple:** app `6834994638`, build `73713b0f-8658-4549-9100-edfb38e9d91a`, bundle `com.owenisas.shalom`, team `3LHSL95J9H`, strict profile `Owenis-XQ59`. The existing signing certificate/profile were reused after live app, owner and signing checks.
- **Status:** uploaded and processed VALID; assigned to existing External Beta and submitted at `2026-11-18T14:31:38Z`. Read-back: **WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW**, not external availability yet. The [public tester link](https://testflight.apple.com/join/urQsNaGH), 100-tester cap and Apple's default auto-notify setting are unchanged. Earlier builds remain valid/unexpired; none was withdrawn. No individual invitations or manual notifications were sent.
- **Included:** permission before every AI send, no auto-send on Allow, offline privacy details/revocation, confirmed local guest-history deletion, explicit report preview/opt-in/export, approved support email and the live [privacy](https://sholam.vercel.app/privacy) / [support](https://sholam.vercel.app/support) links. The Account row now responds across its full hit area. Existing card/sidebar cleanup remains. Every feature is free; sign-in, purchasing and products stay off.
- **Binary:** 4,282,285-byte IPA; SHA-256 `1cf86bbf5091d8f6dbc7ae0548961af0bb4f510e0b5f5f19bc2638c5b16cf7d4`. Archive/IPA identity, distribution signature/entitlements, exact resources including the new privacy manifest, public configuration and absence of DEBUG fixtures were checked. Apple returned **VERIFY SUCCEEDED with no errors**. The upload API supplied no remote checksum, so that optional comparison was skipped; the local hash was verified before upload.
- **Source at upload:** uncommitted native working tree based on `e82dcf8`; 101-file final manifest SHA-256 `9dc82e3a9a2df0a0e5c0b387cb28a25d10596d8e341270b9bd160a4c2b601ba5`. Frozen source, earlier correction snapshots, archive/IPA, test proof, sanitized Apple receipts and `release.json` are operator-local under `ios/build/TestFlight-0.1.3-4/`. No native Git commit/push or backend deployment occurred during that Apple-release pass; the November 19 source publication is separate.
- **Verification:** core 198 passed; final full iPhone 94 passed / 2 iPad-only skipped; final iPad subset 8 passed; the updated report test also passed a focused iPhone rerun. Repository typecheck/lint, 415 Vitest tests (4 skipped) and the 179-card source check passed. A normal Release-simulator run opened both live links and completed a real answer only after disclosure, Allow and a second deliberate Send. Sources correctly showed one looked-up verse and two unchecked references. See [the complete QA record](../docs/NATIVE-UI-REVIEW.md#release-verification-013-4-2026-11-18), including the fixed Account hit area and retained initial iPad harness failure.
- **Review metadata:** new build-specific What to Test text was read back exactly. Version-qualified beta-review notes were updated and checked without printing or changing the private contact/demo fields. Public feedback email remains the approved owenisas@gmail.com. This is Beta App Review, not a public App Store submission or legal/privacy-label approval.
- **Cleanup:** all five raw result/MCP test-product pairs and this run's temporary directory were removed after exporting proof. The sole temporary iPad was deleted; the reused iPhone was restored to its initial app-not-installed/shutdown state. No XCTest clones remain. Older signed artifacts are intact. Retained: this release's archive/IPA/source/proof about 217 MiB and the reused shared DerivedData about 1.74 GiB. Conservative monitored peak: **6.69 GiB**, below the freshly approved 10 GiB cap; final free disk about 87.8 GiB. The monitor is stopped. This completed exception is not reusable for another heavy run.
- **Limits:** no physical-device/TestFlight installation, complete VoiceOver or older-OS matrix, support email delivery/triage test or legal certification. Native sign-in and billing were not activated, agreements not accepted and App Store listing/privacy/age answers not submitted.

## TestFlight release: 0.1.2 (3)

- **Apple:** app `6834994638`, bundle `com.owenisas.shalom`, team `3LHSL95J9H`, strict named profile `Owenis-XQ59`. Existing distribution certificate and Shalom AppStore profile reused; no credentials created or read into chat.
- **Binary:** 0.1.2 (3), build ID `37d9c1e5-ebfd-4754-8d0a-ee2e5f7ea371`, 4,086,688-byte IPA, SHA-256 `aa35bae12748c1b961944f9a30e74434c8629532fc1da2aad3b693ff7cbeba8e`. Signature, distribution entitlements, exact resources, free/auth-off configuration and absence of DEBUG fixtures checked. Apple validation: VERIFY SUCCEEDED with no errors; processing VALID.
- **External:** added to existing External Beta and submitted at `2026-11-18T04:43:55Z`. Read-back: WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW. The [public invitation](https://testflight.apple.com/join/urQsNaGH) and 100-person cap are unchanged. Older builds were not expired or withdrawn; no individual invitations or manual notification command was sent. Apple's auto-notify default remains true.
- **Source:** uncommitted native working tree based on `57b6913`, not falsely represented as that commit alone. The frozen 95-file manifest hash is `8ed17fd5ffebfafcf28b7b144ed11045d2465f36961ef27f714cd8dc047bfc38`. Exact snapshot, signed archive, IPA, test summaries/attachments, failure proof, sanitized signing/Apple receipts and live-client probe are retained under operator-local, gitignored `ios/build/TestFlight-0.1.2-3/`.
- **Live backend:** actual Swift client completed in 23.7 seconds with John 3:16 and 1 John 3:16 independently fetched/checked, no quote warnings; 179 public cards, absent guest private history and invalid-Bearer 401 passed. No backend credential, route or deployment change was needed.
- **App Store preparation:** [submission pack](AppStore/SUBMISSION.md), [draft English metadata](AppStore/metadata.en-US.json) and six opaque native screenshot candidates (iPhone 1206×2622 portrait, iPad 13-inch 2752×2064 landscape) are local only. Public App Store submission is not performed or ready: privacy/support URLs, third-party AI consent/disclosure, privacy-label/manifest reconciliation, content-safety applicability and owner legal/contact/age decisions remain gates.
- **Cleanup:** all 15 result bundles from this release, their 14 completed MCP test-product directories and this run's temp root were removed after exporting summaries/proof. Both temporary iPads were deleted (11-inch retired before the 13-inch replacement); the reused iPhone is shut down, unrelated simulators untouched. Retained: shared DerivedData about 1.1 GiB; this release's archive/IPA/source/proof about 835 MiB; App Store drafts/assets about 2.1 MiB. The conservative monitored peak was 7.75 GiB, below the approved 10 GiB cap; free disk ended around 92 GiB. Signed binaries and provenance from older releases were not deleted.
- **Limits:** simulator-only native UI; no physical-device run, complete VoiceOver audit or pre-iOS-26 visual matrix. Earlier failed overflow and history runs are preserved and not counted as passes. No Git commit/push, App Store submission, agreement acceptance, authentication activation or billing activation occurred.


## TestFlight release: 0.1.1 (2)

Last updated: 2026-11-18. Current sanitized recovery/submission receipt: operator-local, gitignored `ios/build/TestFlight-0.1.1-2/provider-recovery-20261118.json`. The original `release.json` preserves the November 16 upload and then-blocked state; raw proof is not published. Stable public proof: the GitHub CI run, commits and App Store Connect linked below.

| Item | Value |
|---|---|
| Owner approval | Deploy + TestFlight approved by the owner |
| Source | Native + backend committed as [`d167cac`](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/commit/d167cac); merged with latest `main` as [`a9aec36`](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/commit/a9aec36e82f38f79c01676d69bbb0b5894d3aecb), preserving Share Shalom; pushed to `main` as `owenisas` |
| GitHub CI | [Run 43806984409](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/actions/runs/43806984409): success |
| Vercel production | [sholam.vercel.app](https://sholam.vercel.app), credential-refresh deployment `dpl_FnDzNyDE4zcK3W7PUpL4oZHMMktf`, READY, same source snapshot `99d2ce1` (functional code unchanged from `a9aec36`) |
| Vercel inputs | Strict `.vercelignore` dry run: 127 web files, 1,227,475 bytes (an earlier 125-file figure predates the latest `main` and is obsolete); native, caches, proof, agent files and local env uploads excluded |
| Version / build | `0.1.1` / `2`, bundle `com.owenisas.shalom`, team `3LHSL95J9H` |
| Signing | Profile `Owenis-XQ59` with strict authentication (Thomas Suen / Tsz To Suen verified); exact resources, signature, distribution entitlements and absence of DEBUG fixture markers checked; billing off, sign-in disabled, product IDs empty |
| IPA SHA-256 | `9baf9d5728f7694e6ae5803952ff29214b5c3cd284ed47e50c0698cf25d9b96b` (from `ipa-reviewed-verification.json`) |
| Apple validation | `altool` VERIFY_SUCCEEDED. The upload API gave no remote checksum, so that optional comparison was skipped |
| Upload / processing | Processed VALID, build ID `3f260a14-79f2-429f-82b7-522c8cf95c2e`; [App Store Connect app 6834994638](https://appstoreconnect.apple.com/apps/6834994638/testflight/ios) confirmed |
| External group | Existing External Beta `0ad78ad5-09fc-4e85-8532-ef74cc9ad7b5` contains both 0.1.1 (2) and 0.1.0 (1); [public link](https://testflight.apple.com/join/urQsNaGH) and 100-tester cap unchanged |
| External state (2026-11-18) | 0.1.1 (2): submitted, **WAITING_FOR_REVIEW** / **WAITING_FOR_BETA_REVIEW**. 0.1.0 (1): **APPROVED** and **IN_BETA_TESTING**, not expired or withdrawn |

**Release-gate fixes included.** Verification now handles First/I John versus Gospel identity, formatted book labels, compact Roman numerals and unsupported compound ordinals. A specific numeric label is verified only if a complete canonical parse remains after emphasis is removed; unknown annotated or translated numeric labels stay unchecked; opaque labels with no numbers keep the target-lookup contract.

**Checks.** Server 411 passed / 4 skipped; post-merge lint, typecheck, 179-card seed check and production build passed; core 198 passed; app unit 50 + 3 citation UI = 53 passed. The first focused UI run was 52 passed / 1 failed on an unexpected drawer; the unchanged UI test then passed standalone on retry and the final run was 53 passed. The failure capture is kept as a limitation, so full stability is not claimed.

### Provider recovery and external submission, 2026-11-18

The owner supplied a replacement provider credential. It passed OpenRouter's current-key authentication endpoint (HTTP 200) and was installed in Vercel through stdin, without putting its value in a file or the repo. The same production snapshot was redeployed as `dpl_FnDzNyDE4zcK3W7PUpL4oZHMMktf`; no native build, model-route change or paid model was needed.

- The actual Swift client completed a live response in **13.1 seconds**, fetched `JHN.3.16` and `1JN.3.16`, and verified both source links with a final citation check, no unverified references and no quote warnings. Its deck, guest-history isolation and invalid-Bearer 401 checks also passed.
- A fresh browser question fetched `PSA.23.1`, rendered an answer and completed with final citations and `done`. This is successful live inference, not just a loading website or health response.
- Clean reviewer notes replaced the obsolete outage note. The existing **0.1.1 (2)** build was submitted to external Beta App Review at `2026-11-18T01:01:06Z`. Apple reports **WAITING_FOR_REVIEW** / **WAITING_FOR_BETA_REVIEW**; this is not approval or external availability yet.
- The earlier **0.1.0 (1)** is now **APPROVED** and **IN_BETA_TESTING**. The existing public invitation and 100-tester cap remain unchanged.

The original November 16 probes and held submission remain in the operator-local `release.json` and `production-native-smoke-retry.json`: two requests then returned the application's generic upstream 401/403 authentication message before any answer. Their exact credential-rejection cause was not established, and a revoked key is not inferred. The replacement restored live functionality; no old key was revoked by this workflow. Never send a credential in chat or a document; use the secure Vercel environment UI for future changes.

### Not done and not claimed

No individual tester invitations or manual notifications, no public App Store review, no purchases, no migrations, no legal acceptance. Native sign-in and billing remain off (guest mode, empty product IDs). Still unverified: physical devices, VoiceOver, pre-iOS-26 fallbacks, native sign-in, and full UI stability. The earlier Opus UI review still stands for the unchanged UI; there is no fresh Opus review of this build.

### Cleanup (complete, confirmed by the main session 2026-11-16)

Receipt: operator-local `cleanup.json` in the release folder. Removed: this release's exact three Release 0.1.1 `.xcresult` bundles and their three completed MCP test-product directories (after summaries, failure and pass attachments were saved), its own `tmp` root, and `EnvCheck` (public link metadata only; no env or credential files). The existing iPhone 18 Pro was reused and is shut down; the unrelated iPhone 17 was untouched; no new simulator was created. Retained artifacts and evidence: the shared DerivedData cache (about 1.1 GiB) and the release folder (about 192 MiB: prior prototype and final signed archives and IPAs, failure and pass proof, logs, the verifier). Build 1 provenance is untouched. Free disk was last 101 GiB and no further heavy work was started. The final Vercel dry manifest (127 files, 1,227,475 bytes) is in `vercel-final-inputs.json`.

**Historical Apple read-back, 2026-11-16:** build `3f260a14-79f2-429f-82b7-522c8cf95c2e` was VALID in the External Beta group, then READY_FOR_BETA_SUBMISSION without a review submission. This was superseded by the successful November 18 submission recorded above. `autoNotifyEnabled` reads true as Apple's default. No individual invitations or manual notifications were sent by this workflow.

**Historical provider diagnosis, 2026-11-16:** the public SSE message was "OpenRouter rejected the API key" (full text in `production-native-smoke-retry.json`). The real cloud key's format, expiry and exact refusal cause were not proven. The owner-input block was resolved on November 18 by the supplied replacement and verified redeployment; no model-routing change was made.

## Native interface

- **iPhone:** ChatGPT-style leading drawer, compact Shalom header and new-chat action, no bottom tab bar.
- **iPad:** persistent split-view sidebar, recent chats and a Chat / Flashcards switch, with readable-width content.
- A quiet empty state, pale bottom composer, light right-aligned user bubbles and unboxed assistant answers replace the oversized welcome panel and blue answer cards.
- Shalom's sky and exact cross-cloud mark remain, along with the static native launch screen, system typography and availability-guarded native glass.
- Streaming/tool activity, Stop, incomplete/error states, Copy, related cards and honest flashcard proposals.
- Numbered Bible passage sheets, full ranges and checked/unchecked states. Verification comes from the message's final server check, never an unrelated cached lookup.
- All / Quick facts / Discover, once-per-visit shuffle, focused related cards, explicit Show answer / Next / Ask actions, full teaching notes and offline deck fallback.
- Native account/auth lifecycle, scoped Keychain sessions, local sign-out, profile/history/import APIs, account-isolated caches and stale-result barriers. Real sign-in remains gated on external setup and end-to-end verification.

The backend still returns 501 for publishing new flashcards. Native proposals say saving is unavailable; the app does not fake a successful save or publish model drafts.

## Verification results: 2026-11-15 (released source 0.1.0 (1))

These results describe the released source only; they predate the calm-reading fixes. Local 2026-11-16 checks (core 184, app unit 50, backend 380 passed / 4 skipped, focused iPhone and iPad accessibility cases) are listed separately in [the audit](../docs/NATIVE-UI-REVIEW.md#local-verification-2026-11-16-separate-from-the-2026-11-15-released-source-results), with raw files in [Verification/calm-ui/](Verification/calm-ui/) and [local-harness-replay.json](Verification/calm-ui/local-harness-replay.json).

Built with **Xcode 27.1**, Swift 6.4 and the iOS 27.1 SDK. Simulator runs used **iOS 27.0**, one reused iPhone 18 Pro and one temporary iPad Pro 11-inch (M5). Tests ran serially with `-parallel-testing-enabled NO`.

| Check | Actual result | Saved evidence |
|---|---|---|
| Foundation-only Swift core tests, macOS host | 119 passed, 0 failures | [core-tests.log](Verification/core-tests.log) |
| Native app unit tests, iPhone simulator | 33 passed, 0 failures | [app-unit-summary.json](Verification/app-unit-summary.json) |
| iPhone UI suite | 9 passed, 0 failures, 1 iPad-only case skipped | [iphone-ui-summary.json](Verification/iphone-ui-summary.json) |
| Focused phone navigation/compact-label regression | 1 passed, 0 failures | [iphone-label-summary.json](Verification/iphone-label-summary.json) |
| iPad UI suite | 10 passed, 0 failures | [ipad-ui-summary.json](Verification/ipad-ui-summary.json) |
| Latest backend/source-contract suite | 329 passed, 4 skipped; lint and typecheck passed | [testflight-release-checks.log](Verification/testflight-release-checks.log) |
| Native source/resources and seed validation | Passed; 50 fact + 129 discover cards valid | [backend-checks.log](Verification/backend-checks.log) |
| Signed device archive and exported IPA | Correct app, team, certificate, resources and disabled billing | [archive](Verification/testflight-archive-verification.json), [IPA](Verification/testflight-ipa-verification.json) |
| Apple binary validation | VERIFY SUCCEEDED with no errors | [apple-validation.log](Verification/apple-validation.log) |
| Live native-format guest API smoke | HTTP 200; streamed answer, 17 fetched verses, final citations and done; no error event | [native-api-live-smoke.json](Verification/native-api-live-smoke.json) |

The UI suites exercise drawer/sidebar navigation, the composer, no-fixture network refusal, verified and unchecked references, exact multi-verse BSB sheets, Stop retaining partial text, one error without automatic resend, guest history across relaunch, card reveal/next actions and account UI without purchasing controls. App/core tests cover transport, reducers, cache/identity boundaries, auth policy and billing-off invariants.

**UI chat tests use labelled synthetic fixtures.** Separately, the production service accepted a guest POST with the native client's exact request fields and headers and completed a real response in 14.76 seconds. That protocol smoke did not exercise a physical native UI or native sign-in. Release inspection found no native DEBUG fixture strings, product IDs or obvious embedded credentials; it is not a mathematical proof of secret absence.

### Screenshots from actual simulator interactions

- iPhone: [home](Verification/iphone-final-home.jpg), [drawer](Verification/iphone-final-sidebar.jpg), [answer fixture](Verification/iphone-final-verified-answer-fixture.jpg), [passage sheet](Verification/iphone-final-passage-sheet.jpg), [stopped answer](Verification/iphone-final-stopped-answer.jpg), [card front](Verification/iphone-final-flashcard-front.jpg), [card answer](Verification/iphone-final-flashcard-answer.jpg).
- iPad landscape: [home/sidebar](Verification/ipad-landscape-home.jpg), [answer fixture](Verification/ipad-landscape-verified-answer-fixture.jpg), [passage sheet](Verification/ipad-landscape-passage-sheet.jpg), [stopped answer](Verification/ipad-landscape-stopped-answer.jpg), [card front](Verification/ipad-landscape-flashcard-front.jpg), [card answer](Verification/ipad-landscape-flashcard-answer.jpg).
- iPad portrait: [home/sidebar](Verification/ipad-portrait-home.jpg).

Raw attachments are in `Verification/iPhoneFinal/` and `Verification/iPadFinal/`; the latest compact-label home/drawer captures are in `Verification/iPhoneLabelCheck/`. Initial iPad app-frame screenshots were cropped after rotation; final tests use `XCUIScreen.main.screenshot()` to capture the complete display. Generated verification JSON is excluded from Biome formatting to retain Xcode's original serialization. `Verification/` is operator-local evidence and is intentionally excluded from the public repository; its screenshots, recordings and release receipts are not required to build or test a fresh checkout.

### Remaining verification and release gates

Not tested: the full native UI against the live model service on a physical iPhone/iPad; real native email/callback sign-in and physical-device Keychain lifecycle; pre-iOS-26 material fallbacks; the largest Dynamic Type sizes, full VoiceOver audit and complete Reduce Motion/Transparency, keyboard and offline-transition matrix. Both simulator form factors were inspected, but this is not a complete accessibility or supported-OS certification.

A public App Store release still requires privacy/legal review, account deletion before enabling native accounts, moderation if publishing is enabled and explicit release approval. External Beta App Review is not public App Store approval. No physical installation or external tester acceptance is claimed while review is pending.

## TestFlight release: 0.1.0 (1)

Historical receipt from 2026-11-15, kept as recorded. Statements below about uncommitted or undeployed source describe that date; the current state is in the 0.1.1 (2) section above. Build 0.1.0 (1) itself is unchanged and still WAITING_FOR_REVIEW.

| Item | Verified value |
|---|---|
| App Store Connect app | [Shalom: Bible & Flashcards](https://appstoreconnect.apple.com/apps/6834994638/testflight/ios), ID `6834994638` |
| Name inside the app | Shalom |
| Bundle / SKU | `com.owenisas.shalom` / `sholam-ios` |
| Account holder / certificate subject | Thomas Suen / Tsz To Suen |
| Apple Developer team | `3LHSL95J9H` |
| Selected CLI profile | `Owenis-XQ59`, explicitly passed with strict authentication |
| Signing certificate SHA-1 | `19A84A1DCEE942B3F7EF07B9FFD0BE4E3B16C5EA` |
| Version / build | `0.1.0` / `1` |
| Apple build ID | `00679298-9f7e-4d42-9086-f7239d33c151` |
| Processing / internal state | VALID / IN_BETA_TESTING |
| External review | WAITING_FOR_REVIEW |
| External group | External Beta, `0ad78ad5-09fc-4e85-8532-ef74cc9ad7b5` |
| External invitation | [testflight.apple.com/join/urQsNaGH](https://testflight.apple.com/join/urQsNaGH), initially capped at 100 testers |

The exact name Shalom was already reserved by another app, so the App Store Connect record adds a descriptive suffix; the app's own display name remains Shalom. Account identity was established using a live Account Holder lookup, live certificate subject/fingerprint, the existing Marquee app record and the new Shalom record's read-back. Cached web-auth metadata alone was not treated as API identity. The separate LumoLife profile was not used, and authentication defaults were not changed.

The initial Apple agreement gate cleared after the owner handled it. The requested app identifier, app record, App Store provisioning profile and beta groups were then created on the verified team. Reviewer contact fields were reused from that owner's existing approved App Store review profile without writing private contact values into artifacts. Native guest-mode instructions, free-model latency/limits, no-purchase behavior and the external beta description/feedback metadata were saved and read back.

The app target's **Release configuration alone** uses manual signing for team `3LHSL95J9H`, identity Apple Distribution: Tsz To Suen, and profile Shalom AppStore. Debug stays unsigned. Do not pass app provisioning settings globally to `xcodebuild`: Swift package targets reject app provisioning profiles. The archive and exported IPA were checked for matching app/version/team/certificate, `get-task-allow = false`, no native DEBUG fixture markers, exact deck/notices resources and hard-disabled billing.

`ITSAppUsesNonExemptEncryption = false` is present in the shipped binary and Apple's build record. The technical inventory found OS HTTPS/TLS and Keychain use, SHA-256/PKCE hashing and platform RSA signature verification; the resolved Swift Crypto package delegates to CryptoKit on Apple platforms. No custom encryption feature is offered by this app. This classification is distinct from accepting an Apple agreement.

Apple validation succeeded before upload; processing was then confirmed VALID. The upload API did not provide a remote checksum, so its optional checksum comparison was skipped. The local IPA SHA-256 and signature checks are recorded in [testflight-ipa-verification.json](Verification/testflight-ipa-verification.json). The external group contains this exact build; no individual external emails were invited and no link was posted elsewhere. The owner also remains the sole tester in the private Owner Internal group.

Evidence: [release summary](Verification/testflight-release.json), [external review receipt](Verification/testflight-external-review.json), [internal group receipt](Verification/testflight-internal-confirmation.json), [budget receipt](Verification/testflight-budget.json), [native source manifest](Verification/testflight-native-source-manifest.json).

### Archive budget and retained artifacts

The owner approved one bounded release job below 100 GiB free: at most **5 GiB of new artifacts**, a **40 GiB free-space hard stop**, the existing DerivedData path and no new simulators. The same budget baseline was retained across signing/resource corrections. Peak tracked new artifacts were about **0.34 GiB**, below the cap. This completed exception does not authorize future heavy runs generally.

Temporary extracted-IPA and Xcode job-temp directories were removed. The single reusable DerivedData cache is about 990 MiB; the local release folder is about 31 MiB and retains the signed archive, IPA, public signing metadata and a 91-file native source snapshot. The source snapshot excludes local configuration, credentials and build caches. It preserves the released native working tree without pretending the uncommitted source is represented by the repository HEAD. No other session's artifacts were removed. The earlier temporary iPad and passing simulator result bundles were cleaned, and no simulator was created or booted for this release.

## Project layout

| Path | Purpose |
|---|---|
| `project.yml`, `Shalom.xcodeproj` | XcodeGen source and generated universal iOS project |
| `Config/App.xcconfig` | Public URLs/configuration; auth disabled, billing NO, no products |
| `App/ShalomApp.swift`, `RootView.swift`, `SidebarView.swift`, `ApplicationModel.swift` | Composition, responsive navigation and account/cache boundaries |
| `App/Chat/` | Composer, streaming model, Markdown, citation sheets, stopped-draft background write and DEBUG-only fixture transport |
| `App/Flashcards/`, `App/Theme/` | Native deck and visual identity |
| `App/Account/`, `App/History/` | Supabase adapter, account UI, history and explicit guest import |
| `App/Billing/` | Dormant StoreKit adapter, activation gate and DEBUG-only paywall preview |
| `App/Resources/` | Canonical deck/provenance, icon, launch/privacy resources and verbatim dependency notices |
| `Packages/ShalomCore/` | Foundation-only API/SSE, reducers, models, citations, bounds, storage and billing policies |
| `Tests/ShalomTests/`, `UITests/` | Executed app unit and UI tests |
| `Verification/` | Saved release summaries, logs and simulator screenshots; `calm-ui/` holds the local 2026-11-16 calm-reading evidence (summaries, logs, screenshots, simulator recordings, local replay JSON) |

Minimum iOS/iPadOS **17.0**, Swift 6. **supabase-swift 2.55.6** is pinned exactly and compiled successfully; do not copy its unreleased v3 APIs. The dependency-free core also targets macOS 14 for host tests. The web compiler excludes `ios/`, and Vitest collects `tests/` only rather than Xcode-downloaded package examples.

## Checks and local builds

Run from the repository root (`sholam/`):

```bash
python3 -I ios/scripts/check-source.py
```

```bash
xcodegen generate --spec ios/project.yml --project ios
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

The Python check validates canonical deck equality/hashes, dependency-notice provenance, project membership, icon, privacy declarations, signing/account selection, disabled defaults and credential-pattern absence. It does not itself compile Swift or exercise native rendering.

Before another native build, read the workspace disk-hygiene runbook and check free space. Below 100 GiB, do not start new heavy work without a new explicit exception; below 40 GiB, stop. Reuse simulators, keep one shared `ios/DerivedData` location and disable parallel XCTest. Use the Shalom scheme and Debug for simulator testing. Device Release signing is scoped to the verified app target; private signing/API keys never belong in the repository.

Core tests, only after satisfying the disk gate:

```bash
swift test --package-path ios/Packages/ShalomCore --scratch-path ios/DerivedData/CoreTests --jobs 4
```

UI-test launch arguments are **DEBUG only**:

- `--ui-testing`: isolated `https://ui-tests.invalid` backend, no auth startup, billing or network deck refresh. Chat refuses without a fixture.
- `--ui-chat-fixture=verified|unverified|formatted|legacy|scrolling|hold|error`: deterministic, synthetic (not model) answers; `formatted` exercises lists and structure, `legacy` plain unchecked references, `scrolling` long streaming/follow behavior; hold stays open until Stop.
- `--ui-reset-storage`: clears only the isolated UI-test cache.

Do not run the fixture suite against Release: those arguments are ignored there and the real transport would be active.

Repackage canonical teaching data without editing it:

```bash
python3 -I ios/scripts/sync-deck.py
```

After resolving changed Swift dependencies, repackage their verbatim LICENSE/NOTICE files:

```bash
python3 -I ios/scripts/sync-notices.py
```

Regenerate the project after resource changes. `BundledDeck.json` and `DeckProvenance.json` contain the actual 50 fact and 129 discover cards, not generated replacements. `ThirdPartyNotices.sources.json` binds the bundled notice text to resolved dependency versions/revisions and source hashes.

## Native configuration and authentication gate

`Config/Local.xcconfig` is optional and ignored. Only public app configuration belongs there. Never copy `.env.local`, provider keys, service-role keys, database URLs or auth tokens into the target.

Defaults:
- API: `https://sholam.vercel.app`
- Supabase public values: empty
- `SHOLAM_NATIVE_SIGN_IN_MODE = disabled`
- Callback source: `shalom://auth/callback`
- Signing: Debug unsigned; Release app target manually bound to verified team `3LHSL95J9H` and its Shalom AppStore profile.

Current production email templates are browser-link-only. Before enabling native sign-in, separately approve and verify custom SMTP with code-bearing templates (emailCode), or a native callback in Supabase's redirect allowlist (magicLink).

The native-compatible backend changes are deployed (production `a9aec36`); native sign-in is still off. `request-auth.ts` verifies explicit Bearer tokens while preserving browser cookies/CSRF. Invalid Authorization never becomes a cookie/guest request; transient verification outages are 503 with Retry-After. Asymmetric Bearer verification is the default. `SHOLAM_ALLOW_LEGACY_JWT=true` is a server-only compatibility opt-in for a confirmed HS256 project and does not change cookie auth. Auth SDK/JWKS fetches have deadlines; per-instance budgets are not distributed WAF throttling. Model/visitor quotas remain shared through Postgres.

The adapter restores/refreshes scoped Keychain sessions and signs out locally. A first-install marker clears only this app's prior-install service. Before identity changes, old work is drained/cancelled and UI tickets invalidated. Private caches clear on account changes; guest copies import only after an explicit action. Completed-message import counts persist per account, including later completed guest turns. Partial answers stay on device instead of being imported as completed replies.

Custom links may navigate/prefill but never send. HTTPS links need associated domains to enter the app. Implicit-flow token links are rejected.

## Streaming, evidence and local data

Models mirror the website: opaque card/message IDs, lowercase UUID chat IDs, all ten SSE events and optional future `done.saved`, which the server does not currently send.

- Bounded incremental parsing handles split UTF-8, CR/LF boundaries, multiline data and unknown frames.
- Unexpected EOF is incomplete; timeout warns an answer might already be saved. POSTs are never automatically replayed.
- Stop/navigation/background cancels the task. Spinners settle and provisional/failed evidence stays unchecked. A last-moment Stop does not downgrade a completed final answer.
- Saved replies carry explicit checked provenance. Legacy records remain unchecked; an empty issue map does not prove a final check. `sources(in:)`, `ReferenceScanner` and `MarkdownBlockParser` surface legacy plain references (always unchecked) and ordered/nested lists without changing wire or cache enums.
- Account/environment caches use atomic versioned writes, protection until first unlock and backup exclusion. A short OS assertion protects stopped-draft saves. Public caches are environment-scoped too.
- Limits cover history, prompts/events/responses, deck count, caches and imports. Server free-model limits remain authoritative.

`ShalomCore` exposes `ShalomAPIClient`, `AgentEvent`, `ChatReducer`, `HistoryPolicy`, `CitationResolver`, `ReferenceFormatter`, `ChatID`, `ChatCache` and billing policies. `Models.swift` is the wire/domain contract; `ChatViewModel` consumes `ChatStreamingAPI` for network-free UI tests.

## Paywalls are prepared, not active

Three independent gates keep the app free:
1. `ShalomBillingEnabled` is literal **false** in generated/shipped Info.plist, and xcconfigs default to NO.
2. `BillingActivation.approved = false` in source.
3. Product IDs are empty.

Off mode grants every feature and never constructs a StoreKit client, fetches products, purchases, restores/syncs, starts observers, submits receipts or presents a paywall. A server signal can only disable billing. Safety quotas have no upgrade CTA.

The dormant adapter accepts verified transactions only, checks entitlement dates and rechecks listener startup after a racing kill switch. Executed spies cover zero off-mode calls. The labelled paywall preview is unreachable from production navigation.

**Turning a flag on is not a monetization release.** Products/prices/trials, Apple agreements, account-token association, server entitlement validation, real restore/revocation tests, privacy disclosures and explicit owner approval are still required. No live products or prices were invented.
