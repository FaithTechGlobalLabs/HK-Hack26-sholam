# Shalom for iPhone and iPad

Last updated: 2026-11-16

Native SwiftUI Shalom, alongside the Next.js website. **Every feature is free. Paywalls and purchasing are disabled.** This is not a WebView wrapper.

## Status: external TestFlight review pending

**0.1.0 (1)** was signed, validated by Apple, uploaded and processed successfully. At the last check on **2026-11-16**, its external TestFlight submission was **WAITING_FOR_REVIEW**. The [public invitation link](https://testflight.apple.com/join/urQsNaGH) was configured with a 100-tester cap; external access requires Apple approval. The verified owner also has access through the private internal group. This local UI-fix pass did not re-check Apple's status.

Native source remains **uncommitted and unpushed**. The native-compatible backend authentication adaptations have not been deployed, and native sign-in remains intentionally disabled. This release uses guest mode. No purchases, paid products, database migrations, external sign-in setting changes or public App Store submission occurred. The agent did not accept Apple agreements or switch authentication defaults.

## UI audit

The owner requested an Opus review of motion and response formatting on 2026-11-16. The [canonical native UI audit](../docs/NATIVE-UI-REVIEW.md) records the findings, the local fixes applied afterwards and the evidence limitations.

**Calm-reading fixes (local source only, 2026-11-16).** The audit was applied to the uncommitted, unpushed source: static sky `Canvas`; short, non-bouncy, one-card carousel swipes with a quiet reveal and hidden neighbor text; one Sources / Copy / status section with collapsed sources and full passage sheets; a 640pt answer maximum; ordered, nested and `+` bullet parsing with safe streaming tails; geometry-driven follow that preserves browsing and resumes at the bottom; and legacy plain references shown as always unchecked. Accessibility-size layout was also fixed: the composer keeps its height above the keyboard, home prompts hide while the composer is focused, and the sidebar scrolls as one list (intrinsic-height rows, fixed 20pt icons, wrapping account text, footer inside the scroll view at accessibility sizes, iPad 340 ideal / 400 max, phone drawer up to 360). The server also normalizes supported English plain references into `verse:` links for display only; raw model and history blocks stay verbatim.

**Released build 0.1.0 (1) does not contain these fixes.** No commit, push, backend deployment, TestFlight submission, Apple contact, authentication or paywall activation occurred. External review of 0.1.0 (1) was last checked WAITING_FOR_REVIEW on 2026-11-16 and not re-checked for this pass.

Local results ([Verification/calm-ui/](Verification/calm-ui/), simulator only, synthetic fixtures): core 184 passed; backend 380 passed / 4 skipped with lint, typecheck and a 179-card source check; full iPhone run 65 passed / 0 failed / 1 iPad-only skipped (50 app unit + 15 UI, [summary](Verification/calm-ui/iphone-final-summary.json)); full iPad UI 16 passed ([summary](Verification/calm-ui/ipad-ui-summary.json)). Both full runs precede only the accessibility-size footer move; focused re-runs afterwards passed (iPhone 54, iPad 4, plus one account-visibility proof each). An independent visual review of the actual screenshots passed. The [audit](../docs/NATIVE-UI-REVIEW.md#local-verification-2026-11-16-separate-from-the-2026-11-15-released-source-results) holds the full table, non-blocking limits and cleanup receipts.

Not verified: motion beyond two earlier simulator recordings, the iPhone keyboard-up matrix, a full VoiceOver audit or accessibility certification, physical devices, native sign-in, pre-iOS-26 fallbacks, and the live model through the native UI.

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

Deploy the native-compatible backend changes before using app sessions. `request-auth.ts` verifies explicit Bearer tokens while preserving browser cookies/CSRF. Invalid Authorization never becomes a cookie/guest request; transient verification outages are 503 with Retry-After. Asymmetric Bearer verification is the default. `SHOLAM_ALLOW_LEGACY_JWT=true` is a server-only compatibility opt-in for a confirmed HS256 project and does not change cookie auth. Auth SDK/JWKS fetches have deadlines; per-instance budgets are not distributed WAF throttling. Model/visitor quotas remain shared through Postgres.

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
