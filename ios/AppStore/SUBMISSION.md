# Shalom App Store submission preparation (DRAFT)

Last updated: 2026-11-19

Status: repository preparation draft only. The owner approved the public support email and requested the support/privacy pages; the listing, legal declarations and public App Store submission are not approved. No App Store listing metadata or screenshots have been entered or submitted. Companion file: [metadata.en-US.json](metadata.en-US.json) (draft listing, intended URL candidates and unset submission fields).

## 0. Scope and authorization

- App Store Connect record: Shalom: Bible & Flashcards, app `6834994638`, bundle `com.owenisas.shalom`, SKU `sholam-ios`, team `3LHSL95J9H` (unchanged). The in-app display name is "Shalom".
- Candidate binary: **0.1.3 (4)** was Apple-validated, uploaded and processed VALID. It is in the existing External Beta group and submitted to Beta App Review at `2026-11-18T14:31:38Z`; read-back WAITING_FOR_REVIEW / WAITING_FOR_BETA_REVIEW. Build ID `73713b0f-8658-4549-9100-edfb38e9d91a`. It contains the privacy/readiness fixes and active live links. This is not an App Store review submission or confirmation of physical TestFlight installation. All older builds remain valid/unexpired. The public App Store version record was not changed or attached to this build. Full receipt: [native release record](../README.md#testflight-release-013-4).
- NOT authorized: public App Store submission, accepting agreements, changing storefront/pricing/availability/categories, enabling native sign-in or billing, creating products or unrelated account settings. The owner separately authorized the 0.1.3 TestFlight release and, on 2026-11-19, committing/pushing its native source, tests and preparation documents. That Git publication does not authorize another Apple submission or a parent-repository commit. External Beta App Review is not public App Store review.
- The listing remains a local draft. Six native screenshot candidates now exist: three iPhone 1206×2622 portrait and three genuine 13-inch iPad 2752×2064 landscape images. See `screenshots/iphone-manifest.json` and `screenshots/ipad-manifest.json` for sources, hashes and capture limits. The metadata-writing agent did not build or capture them; main generated them from the verified native UI. No App Store metadata or screenshots have been uploaded.

## In-app readiness fixes in TestFlight 0.1.3 (4), 2026-11-18

The owner first approved these fixes locally after the 0.1.2 (3) upload, then authorized a separate bounded release. They are now in the uploaded **0.1.3 (4)** TestFlight candidate, VALID and waiting for external Beta App Review. At upload time, native source was uncommitted; its exact 101-file snapshot stays frozen and the November 19 source publication is checked against it. The old 0.1.2 (3) binary/snapshot is unchanged. No public App Store submission or backend deployment occurred in the native release.

- Every chat send path is gated before history mutation or transport by a versioned, per-environment/account permission. The first attempted question stays as a draft. Explicitly allowing permission does not auto-send; declining or swiping the sheet away grants nothing. Flashcards remain usable without AI permission.
- The disclosure names Shalom, OpenRouter, the selected provider, recent chat context, hosting/rate-limit metadata and retention/training uncertainty. Permission can be revoked in Account; it stops an active stream and gates later sends. Offline Privacy Details are reachable before agreeing and from Account.
- Privacy and support web URL slots are optional public configuration, HTTPS-only and credential-free; 0.1.3 (4) sets them to the published pages. On 2026-11-18 the owner explicitly approved **owenisas@gmail.com** as Shalom's public support email. `SHOLAM_SUPPORT_EMAIL` now supplies it to local native source. Privacy/Help displays the address and a user-tapped email link with only a static subject, no report body or chat history. This does not send mail. The separate website pages described below are now published and their production URLs verified. Missing contacts/policy are never replaced with invented endpoints.
- Answer Report prepares an exact export preview. Answer text is excluded by default, included only by a deliberate toggle, and bounded. There is no automatic upload or claimed receipt. Copy is device-local and expires after ten minutes. **This is not a completed support/reporting service until a real contact and triage process are configured and verified.**
- Confirmed Delete local chats clears the guest cache and unsent draft, drains late writes and account-transition preservation, preserves the public deck and cannot claim to erase previously shared provider data. It is not an account/server deletion feature.
- The source privacy manifest no longer declares inactive EmailAddress/UserID collection in this sign-in-disabled build. OtherUserContent stays conservatively linked for app functionality; this is not a final App Store privacy-label decision. Before enabling native sign-in, revisit the manifest and account-deletion requirements.

Final release evidence is in the [0.1.3 QA record](../../docs/NATIVE-UI-REVIEW.md#release-verification-013-4-2026-11-18): core 198 passed; full iPhone 94 passed / 2 iPad-only skipped; final iPad 8 passed; updated report check passed a focused iPhone rerun. Actual Release-simulator actions opened both live pages and completed a real chat after consent plus a second Send. The [earlier local QA record](../../docs/NATIVE-UI-REVIEW.md#privacy-readiness-fixes-2026-11-18-unreleased) remains historical evidence. These are simulator/no-network-fixture checks, not physical-device, real report-delivery or privacy-law certification. Source checks, tests, offline UI and publishing a policy do not by themselves establish a legally reviewed privacy/support setup.

## Public website pages published, 2026-11-18

The owner requested the support page and privacy policy after approving owenisas@gmail.com as the public contact. Static, account-independent routes now exist in the website, with the existing Shalom mark, sky palette and Geist typography:

| Page | Source | Canonical production URL | Publication |
|---|---|---|---|
| Support | [`support/page.tsx`](../../src/app/(information)/support/page.tsx) | [Support](https://sholam.vercel.app/support) | Published; canonical production URL verified |
| Privacy policy | [`privacy/page.tsx`](../../src/app/(information)/privacy/page.tsx) | [Privacy policy](https://sholam.vercel.app/privacy) | Published; canonical production URL verified, not legally certified |

The support page includes the approved email, troubleshooting FAQs, report-sharing instructions and the limits of local deletion. Email links set only a static subject; they do not attach messages, export reports or send mail. The policy describes AI requests/recent context, OpenRouter and downstream providers, browser/native guest storage, website account history and guest-chat import, service cookies/storage, rate limits, email processing and privacy requests. It does not promise zero retention, no training, automatic server deletion or a response deadline. New native privacy/report/delete controls are described conditionally because uploaded 0.1.2 (3) does not contain them.

Support/Privacy links are available from sign-in screens and the signed-in account menu. The pages themselves contain no sign-in form, account lookup or model call. Shared website request/session infrastructure still applies; static page content is not a promise that hosts receive no network metadata.

Local verification: typecheck, Biome, all 28 Vitest files (415 passed, 4 skipped), seed validation (50 fact + 129 Discover), production build and whitespace checks passed. Next prerenders both routes as static. Browser checks covered both pages at 320, 375, 414, 768 and 1280 CSS-pixel widths, no horizontal overflow, 44px navigation targets, all seven FAQ controls, policy jump links, skip-link focus and the subject-only contact link. The sign-in help rail and existing chat/card routes were smoke-checked without submitting a form or chat. No console/server errors were found; one cancelled Next navigation/prefetch request was observed, not a server failure. The signed-in account-menu branch was typechecked/built but not exercised with a live login. Web captures in [`build/public-info-2026-11-18/`](../../build/public-info-2026-11-18/) are local browser proof, not native App Store screenshots.

The owner subsequently authorized pushing and deploying these pages. Web-only commit [`e82dcf8`](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/commit/e82dcf80bccb7c4237f45bede32764c962f4b796) is on `main`; [GitHub CI passed](https://github.com/FaithTechGlobalLabs/HK-Hack26-sholam/actions/runs/44299669163). Vercel deployment `dpl_AcLbpr1e7PfFjCZLrfrJsegm1epJ` is READY in Production and serves `sholam.vercel.app`. The commit's successful Vercel status links to that exact deployment, and both canonical page URLs were independently retrieved without login. Browser layout/interaction checks were local; this install could not attach the production URL for remote visual inspection.

At the website-publication step, only the 13 website/documentation/test files were committed; native source was excluded and its 109 preservation hashes matched. The subsequent, separately authorized TestFlight 0.1.3 (4) now contains active native URL settings and the privacy fixes. Its beta notes/review were written to Apple, but no public App Store listing/labels/age answers or screenshots were submitted, and no email was sent. The original upload came from an uncommitted tree; the November 19 source publication tracks those verified inputs without replacing the original snapshot. Operator/legal identity, actual retention settings, final policy review and support delivery/triage remain unresolved.

## 1. Verified product facts (from repo, 2026-11-18)

| Fact | Evidence | Note |
|---|---|---|
| Every feature free; billing off; product IDs empty | `ios/Config/App.xcconfig` (`SHOLAM_BILLING_ENABLED = NO`, `SHOLAM_PRODUCT_IDS =` empty); `ios/README.md` | No IAP, subscription or paywall to describe |
| Native sign-in disabled; everyone is a guest | `SHOLAM_NATIVE_SIGN_IN_MODE = disabled`; `ios/App/Account/AuthStore.swift` header comment; `SHOLAM_SUPABASE_URL` and key empty in the xcconfig | Source of the shipped values is the xcconfig; `Local.xcconfig` is optional and git-ignored, so confirm the release IPA values with main |
| iPhone and iPad, iOS 17.0 minimum | `ios/project.yml` (`TARGETED_DEVICE_FAMILY "1,2"`, deployment 17.0) | iPad screenshots required |
| 179 bundled cards: 50 fact + 129 discover | `ios/App/Resources/BundledDeck.json`, `DeckProvenance.json` | Teaching text copied unmodified from canonical sources |
| Bible text: Berean Standard Bible, public domain (CC0) | `docs/SOURCES.md` | Cited by the repo from berean.bible; not re-fetched here |
| Chat answers come from a model through the project backend | `src/app/api/chat/route.ts`; `src/lib/agent/openrouter-config.ts` | Default model `nvidia/nemotron-3-ultra-550b-a55b:free`; only `:free` ids accepted; base URL `https://openrouter.ai/api/v1` |
| What the client sends | `bodySchema` in `route.ts`: `message`, optional `chatId`, up to a capped number of recent `history` turns | The request is processed by the server and forwarded to the model provider as prompt context |
| Guest chats are not saved server-side | `saveTurn` only exists when `userId` is set; guests have no `userId` | Guest history lives in the device cache; the sidebar now says "Guest chat history is saved here." Sent questions/recent context still go to the server and AI services |
| Server keeps a hashed IP rate-limit key | `visitorKey` in `src/lib/agent/usage-limit.ts` (HMAC-SHA256 of IP, 22 chars); `usageStore()` uses Postgres counters when a database is configured, else memory | Periodic best-effort cleanup attempts to remove rows last updated more than 3 days earlier; not an exact deletion or backup-retention guarantee |
| Supabase use | Server reads cards/verses and holds the usage counters; the native app talks to the project backend, not to Supabase directly in guest mode (inferred from empty Supabase config; not exhaustively traced) | |
| Public cards read-only | `POST /api/flashcards` returns 501 until a later phase; native UI says saving is unavailable | Do not advertise card publishing |
| Citations | Each reference is checked against verses fetched in that turn and shown as checked or not checked | Accuracy is not guaranteed; the UI states "Shalom can make mistakes" (`ChatScreen.swift` line ~338). Never claim the answers are accurate or doctrinally authoritative |
| Encryption flag | `ITSAppUsesNonExemptEncryption: false` in `project.yml` | Owner to confirm answer |
| Privacy manifest (0.1.3 candidate) | `ios/App/Resources/PrivacyInfo.xcprivacy`: no tracking; OtherUserContent linked for app functionality; accessed-API reasons C617.1 and CA92.1 | Inactive EmailAddress/UserID declarations removed; final provider/backend privacy-label review still required. Uploaded 0.1.2 (3) keeps its original manifest |

### Original gaps found before the in-app pass

This is the original checklist, not the current implementation status. The local changes above close the consent/offline-privacy/local-delete code gaps, and support/privacy pages are now published. Final policy/legal review, support delivery/triage and owner declarations remain open. The uploaded 0.1.2 (3) does not contain the new native changes; 0.1.3 (4) does.

1. No in-app disclosure or consent step before chat text is sent to a third-party AI provider. Only the generic "Shalom can make mistakes" footer was found. Guideline 5.1.2(i) (quoted in research below) asks for clear disclosure and explicit permission.
2. No privacy-policy link in the app, and no privacy or support page in the web app (`src/app` has only `auth`, `login`, `api`). Guideline 5.1.1(i) requires a policy link in Connect metadata and in the app.
3. No report-content or flag control on AI replies found. Guideline 1.2 includes the phrase “social media, user-generated content platforms, and AI content creation apps” and requires safeguards for covered apps. Whether this Bible Q&A experience falls within that category needs a product/review decision; do not assert an exemption or call a report control implemented.
4. No local "delete chat history" action found in a grep of the native source. Guest data is local, so account-deletion rules (5.1.1(v)) are probably not triggered while there is no account and no server-side guest record; this is an inference to confirm with Apple's wording at submission.
5. Production support surface (URL, email, owner entity) is not in the repo.

## 2. Draft listing (see JSON for the exact strings)

Limits rechecked locally: name 26/30, subtitle 28/30, promotional text 161/170, description 1531/4000 and keywords 94/100 bytes, checked 2026-11-18. The two-character keyword AI was removed. What's New is null because Apple's platform-version reference says it is not available for the first App Store version.

Claims policy applied: no metrics, rankings, testimonials, prices or "best/most accurate" language; no statement that answers are verified correct; no mention of features that are not live (no sign-in, sync, card publishing, subscriptions). The description states that questions go to Shalom's server and an AI model service. If the owner prefers to name the provider, that needs the unresolved facts in section 6.

Open decisions: category (draft proposes Reference, secondary Education, owner to confirm), copyright holder string, whether "Christian" and "Berean" belong in keywords (Berean refers to the BSB, whose name usage the sources file notes is respected), and whether "AI" should appear.

## 3. Review notes template

The updated public-App-Store template is in `review.notes` of the JSON and has not been submitted there. Existing private beta review contacts stayed unchanged and were not copied into this file. Rules: guest experience only, no demo account, backend must be live and the model route must have budget during review (Guideline 2.1: services live and reachable). A recorded outage on 2026-11-16 was resolved on 2026-11-18 by a replacement provider credential. During this release, a fresh actual Swift-client request completed in 23.7 seconds, fetched John 3:16 and 1 John 3:16 separately, and completed with checked sources and no quote warnings (`ios/build/TestFlight-0.1.2-3/production-native-smoke.json`, operator-local). The free-model route has daily caps (per code comments, a shared OpenRouter free allowance), so confirm chat works on the day of submission and avoid submitting when the allowance is near exhausted. Do not mention features that are not in the build. Local public-App-Store contact fields remain null until the owner confirms them. For the newer TestFlight candidate, actual Release UI also completed John 3:16 with one looked-up source and two explicitly unchecked references; see `ios/build/TestFlight-0.1.3-4/production-release-ui-smoke.json`.

## 4. Release readiness gates

| Gate | State |
|---|---|
| Candidate binary uploaded/processed, native checks | 0.1.3 (4) VALID and waiting for external Beta App Review; final simulator checks passed. Not physically installed through TestFlight or selected for a public App Store version |
| Screenshots made from the real native UI, correct sizes, no alpha | Six candidates prepared: iPhone 1206×2622 and iPad 13-inch 2752×2064; opaque JPEG; not uploaded |
| Privacy policy URL live and linked in-app | `/privacy` published and verified; active link opened from the Release candidate. Operator/legal review remains pending |
| Support URL and contact live | `/support` published and verified; active link opened from the Release candidate, approved email displayed. Email delivery/triage remains unverified |
| Third-party AI disclosure/consent in app | Included in uploaded 0.1.3 (4), with no-auto-send/revocation tests and actual Release UI verification |
| Report mechanism for AI replies | User-controlled draft/export implemented; not a received/triaged report service yet |
| App Privacy answers filled | Blocked on unresolved facts (section 6) |
| Age rating questionnaire answered | Checklist researched, including descriptors effective November 16; final Connect answers remain an owner decision (section 7) |
| Export compliance confirmed | Owner confirm |
| Live backend check on submission day | Passed for the TestFlight release; repeat before any future public App Store submission |
| Agreements, tax and banking status | Not checked; not needed for a free app but agreements must be accepted by the account holder; not authorized here |
| Copyright and legal owner string | Blocked: owner |
| Release method (manual vs automatic), phased release | Owner choice; not set |
| Explicit owner go-ahead to submit | Not given |

## 5. Screenshot storyboard and capture requirements

Requirements (Apple, fetched 2026-11-18 from the [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)):

- iPhone: the page names Dynamic Island (medium), 1179×2556 or 1206×2622 portrait, as a required class. Three 1206×2622 candidates are prepared. The page separately lists large-display sizes 1260×2736, 1290×2796 and 1320×2868 and fallback scaling rules, including a Face ID large-display requirement when no Dynamic Island large set is provided. Preserve those fallback rules rather than describing the page as contradictory; confirm the exact slots shown by Media Manager before upload. No separate large-display set is prepared yet.
- iPad (app runs on iPad): at least one at 13-inch, 2064 x 2752 or 2048 x 2732 portrait (landscape 2752 x 2064 or 2732 x 2048).
- 1 to 10 per size; JPEG or PNG; no alpha or transparency. If the UI is the same across sizes, the highest required size alone is accepted and scaled. Orientation: keep one orientation per set (mixing is not addressed by Apple).
- Future (not now): iPhone Duo sizes required from April 2027 for apps on the iOS 27.1 SDK or later.

Honesty rules: Guideline 2.3.3 says screenshots should show the app in use, not merely title art, a login page or a splash screen, and permits text overlays. The independent review re-fetched this wording on 2026-11-18. Do not invent a numerical quota for in-app frames or misattribute other guidance to this subsection. The prepared candidates show actual home/card screens without marketing overlays or fictional AI responses.

Source capture requirements:

- Real captures of the current native UI, release configuration, iPhone with Dynamic Island and a 13-inch iPad, status bar clean. No synthetic device frames, no HTML or marketing mock-ups.
- Raw synthetic UI-test chat captures (the labelled fixture screenshots in `ios/Verification/`) are QA proof only. They are not finished App Store screenshots, and fixture replies must not be presented as live model output.
- If a chat screenshot is used, it should come from a real response from the live backend, with a question the owner approves; reference label states (checked/not checked) must be what the app actually showed. Log source build, device, date and question for reproducibility.
- Verify pixel size and absence of alpha before upload (`sips -g pixelWidth -g pixelHeight -g hasAlpha`).
- Six candidates are now prepared and manifest-hashed. Main reviewed the iPhone front/back/home and the correctly oriented iPad card screens. The iPad PNGs carry EXIF orientation 8; preparation applies that rotation to pixels and removes rotation metadata. Final JPEGs are native-size 2752×2064, not enlarged 11-inch captures. No synthetic AI chat response or accuracy overlay appears. Status-bar time is not normalized; cosmetic polish remains optional.

Storyboard (per device; 5 frames proposed, content from the real UI):

1. Home chat with the quiet empty state and composer (shows the product honestly; counts as in-app use).
2. A real answered question with the Sources section collapsed and the "can make mistakes" footer visible.
3. Passage sheet open on a reference showing the full BSB passage and its checked state.
4. Flashcard front (question, Show answer).
5. Flashcard back (answer, explanation, Next, Ask Shalom).
Optional 6: iPad sidebar with Chats and the Chat / Flashcards switch (iPad set; the iPad frame set should show the persistent sidebar). Optional overlay captions, if any, must be short, truthful and not cover the UI; keep wording consistent with the listing (no accuracy claims).

### Prepared candidate files

| Device / format | Question | Answer | Home |
|---|---|---|---|
| iPhone, 1206×2622 portrait | [Question](screenshots/iphone-dynamic-island-medium/01-flashcard-question.jpg) | [Answer](screenshots/iphone-dynamic-island-medium/02-flashcard-answer.jpg) | [Home](screenshots/iphone-dynamic-island-medium/03-chat-home.jpg) |
| iPad 13-inch, 2752×2064 landscape | [Question](screenshots/ipad-13-inch/01-flashcard-question.jpg) | [Answer](screenshots/ipad-13-inch/02-flashcard-answer.jpg) | [Home](screenshots/ipad-13-inch/03-chat-home.jpg) |

All six are opaque JPEGs. The iPhone card is the canonical Psalm 23 quick fact; the iPad card is the canonical Discover question about doing good without belief in God. No synthetic chat answer is represented as live output. The images are Debug/no-network capture candidates from the same frozen app source, not a claim that the Release IPA was screenshot-tested pixel-for-pixel. Manifest hashes and original proof paths are in [iPhone manifest](screenshots/iphone-manifest.json) and [iPad manifest](screenshots/ipad-manifest.json). Before final upload, confirm the Media Manager slots, any additional large-iPhone fallback requirement and cosmetic status-bar choices.

## 6. Proposed App Privacy label and data-flow map (proposal, unresolved)

Apple definition of collect (research from [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)): data transmitted off the device and accessible to you or partners for longer than needed to service the request in real time. The label must include partner-collected data.

Data flow (guest, sign-in disabled):

```
Device (guest chat cache, local only)
  -> POST /api/chat on the project backend (Vercel, functions in sin1 per vercel.json):
       message + recent history turns (+ chatId)
  -> backend reads cards/verses from Postgres (Supabase, Singapore)
  -> backend forwards prompt, tool results and history to OpenRouter (free model route)
  <- streamed answer to device
Backend also: HMAC-hashed IP -> usage counter (Postgres, else memory); logs per hosting defaults
```

Proposed disclosures:

| Item | Proposal | Status |
|---|---|---|
| User Content (Other User Content): chat questions and replies | Declare as collected if any party keeps it beyond real-time servicing; purpose App Functionality; not used for tracking | UNRESOLVED: depends on OpenRouter retention/logging for the free model route and the chosen model's provider, and Vercel log retention. Not verified by this draft. Free-route terms on training/logging must be read from the provider's current terms before deciding |
| Identifiers or usage counters (hashed IP) | Owner decides whether a salted hash used for rate limiting counts and in which category | UNRESOLVED; retention of counter rows unverified |
| Email address, User ID | Native sign-in/account collection disabled; user-entered chat may still contain personal data | Inactive declarations removed in unreleased source; restore/review when native sign-in is enabled. Uploaded 0.1.2 (3) is unchanged |
| Tracking | No | No ad SDKs or tracking domains found in the manifest; confirm no SDK adds any |
| Diagnostics / analytics | None found in the native source | Confirm no crash or analytics service is embedded |
| Linked to user | OtherUserContent remains conservatively linked in the native source manifest | Do not infer unlinked status from guest mode alone; confirm processing, identifiers and retention before final App Store answers |

Provider documentation retrieved 2026-11-18: [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection) says prompt/response content is not stored by OpenRouter unless optional logging/use is enabled or content is flagged as potential CSAM; request metadata is stored. [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging) says downstream provider policies vary and free and paid training permissions have separate account controls. The retrieved table lists NVIDIA as potentially training on prompts with an unspecified retention period. That is not proof of the actual endpoint used for each Shalom request or of the owner's account settings. Do not claim zero retention or no training without verifying the live route/provider terms and settings; no settings were changed during preparation. Apple privacy-label classification therefore remains unresolved.

Unresolved legal and owner facts: the legal entity operating the service and publishing the app; actual provider/host retention and training settings; handling and verification of server-data requests; and any age-limited processing requirements. The owner approved owenisas@gmail.com for support/privacy requests. Policy text is now published at `/privacy`, and both production URLs are verified; final legal review remains pending. Do not invent the operator's identity or treat the draft as a legal certification.

Related guideline points (5.1.2(i) re-fetched in independent review on 2026-11-18): “You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so.” The store description is not an in-app permission step. 5.1.1(v): account creation requires in-app account deletion, and Apple's FAQ says automatically generated guest accounts count. In the current build guests are not accounts, so this is believed not triggered; re-check before enabling any account.

## 7. Age-rating questionnaire checklist (do not submit guessed answers)

Apple's current ratings are 4+, 9+, 13+, 16+ and 18+. Apple's official ratings definitions and July 2025 notice were retrieved again through the research pool on 2026-11-18; AI assistant/chatbot features must be considered when evaluating sensitive-content frequency. The initial questionnaire-specific URL returned 404, so the exact authenticated Connect screen is still unverified. A November 2, 2026 Apple notice adds Shared Location and Dating and Relationships descriptors from November 16, 2026, with a January 12, 2027 completion deadline. Those descriptors must be addressed for a submission now, not treated as future-only. No location sharing or romantic/sexual companion feature is implemented in Shalom; final answers still need confirmation against the build and current questionnaire. Nothing was submitted.

| Topic | What to decide |
|---|---|
| Messaging and chat / user-generated content | The user types free text to an AI; no user-to-user messaging or sharing. Decide how the options are worded for AI chat |
| Unrestricted web access | Does any in-app view browse arbitrary web pages? Passage sheets use bundled/server data; confirm no web view |
| Mature themes, violence, sexuality, profanity, substance references, horror, gambling | Bible narratives and an open AI model can produce such content on request. Answer for the plausible AI output range, not only the curated cards |
| Medical, wellness, or counseling claims | App is not a counseling or medical service; decide how the pastoral-advice risk is described |
| In-app controls (parental controls, age assurance) | None found in the app |
| Contests, loot boxes, advertising | None found |
| Final rating | Owner decision, including whether to add content filtering or stronger safeguards |

Metadata must also be appropriate for 4+ audiences (2.3.7/2.3.8 per research).

## 8. Pre-submission verification checklist (when main has final images and build)

1. Listing text lengths re-checked; no claim outruns the app. 2. Screenshots at correct sizes, no alpha, at least one iPad 13-inch set. 3. Privacy URL and support URL load publicly. 4. App Privacy answers entered by the owner. 5. Age rating entered by the owner. 6. Build processed, selected for the version, export compliance answered. 7. Review notes final, contact filled. 8. Backend and model route live and under limits. 9. Explicit owner approval to submit.

## 9. Sources and retrieval gaps

- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) (fetched 2026-11-18, read by this task).
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [2.3.3](https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots/), [5.1.1 account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/), [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), [age ratings](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/), [Apple news on updated age ratings](https://developer.apple.com/news/?id=ks775ehf), [complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/). These come from the supplied research and were not re-fetched here.
- Later retrievals: main re-read Apple's screenshot specification page; independent review re-read the guidelines and platform-version metadata reference, including the support URL requiring actual contact information and first-version What's New being unavailable. Main retrieved [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging), [Apple age definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/) and [November 2026 descriptor notice](https://developer.apple.com/news/?id=yxkh08us) through the free research pool. No paid retrievals or login occurred.
- Remaining retrieval gaps: the authenticated age-rating screen, exact OpenRouter account/endpoint privacy controls, Vercel/Supabase retention settings and all provider-specific legal terms are not verified. Export-compliance classification remains the existing technically reviewed declaration, not a new legal opinion. The Berean Standard Bible licence statement is repo-cited only.
- Repo evidence: `ios/README.md`, `ios/project.yml`, `ios/Config/App.xcconfig`, `ios/App/Resources/PrivacyInfo.xcprivacy`, `src/app/api/chat/route.ts`, `src/lib/agent/usage-limit.ts`, `src/lib/agent/openrouter-config.ts`, `docs/SOURCES.md`, `docs/PLAN.md`.

## 10. Lightweight checks run

`metadata.en-US.json` parses as valid JSON and passes Biome formatting; field lengths are in section 2. All six screenshots were decoded independently to verify native dimensions, opacity and upright orientation; their manifest SHA-256 values match. The public support contact is now owenisas@gmail.com, explicitly approved by the owner. The `/support` and `/privacy` pages are now published with owner approval, after passing local browser/build checks and GitHub CI. Both canonical production URLs were retrieved successfully and are recorded in the local draft listing; no Apple metadata was written. Native URL configuration, marketing URL, legal copyright and private App Review contact remain unresolved; support email approval does not supply those decisions. Public App Store metadata, screenshots, privacy labels and age answers were not written to Apple; no agreement was accepted. Native TestFlight release operations are recorded separately in `ios/README.md`.
