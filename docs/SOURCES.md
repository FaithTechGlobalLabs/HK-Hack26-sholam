# sholam data sources and licences

Last updated: 2026-11-14

Only data listed here as **in use** or **approved** may ship. Researched 2026-11-14 through the research pool; "checked" means the primary page was read.

## In use

| Data | Licence | Where | Notes |
|---|---|---|---|
| Berean Standard Bible (BSB) | Public domain, CC0, dedicated 2023-04-30 ([berean.bible/terms.htm](https://berean.bible/terms.htm), checked; [CrossWire](https://www.crosswire.org/sword/copyright/ModInfoCopyright.jsp?modName=BSB)) | Import source: [BSB-publishing/bsb2usfm](https://github.com/BSB-publishing/bsb2usfm) releases (v5.2 when checked), USJ/USFM. Fallback: [bible.helloao.org](https://bible.helloao.org/docs/) (no key, caching allowed) | Publisher asks that altered text not use the "Berean" name. We store the text unchanged. Demo verses and seed-card facts were checked against helloao's BSB on 2026-11-14 |
| Seed flashcards (`data/flashcards.seed.json`) | Written for sholam | This repo | Each card's refs and facts checked against BSB text |

## Approved for later phases

| Data | Licence | Notes |
|---|---|---|
| World English Bible (WEB) | Public domain ([ebible.org FAQ](https://ebible.org/eng-web/webfaq.htm), checked) | "World English Bible" is a trademark: use the name only for unchanged text |
| ASV (1901) | Public domain by age | Dated English; low priority |
| Easton's Bible Dictionary (1897) | Public domain ([CrossWire](https://crosswire.org/sword/modules/ModInfo.jsp?modName=Easton)) | JSON at [JWBickel/BibleDictionaries](https://huggingface.co/datasets/JWBickel/BibleDictionaries) |

## Pending a licence check

| Data | Issue |
|---|---|
| OpenBible.info cross-references (~340k) | Commonly described as CC-BY, but the [primary page](https://www.openbible.info/labs/cross-references/) did not state it when read. Confirm before import |
| Nave's Topical Bible | The 1897 work is public domain, but the CSV transcriptions found carry conflicting licences (CC BY 4.0 vs CC BY-NC-SA 4.0). Use an original-source copy or skip |

## Do not use

| Data | Why |
|---|---|
| API.Bible | Commercial plan required, cached content must refresh every 30 days, analytics required, LLM use of content prohibited ([terms](https://api.bible/terms-and-conditions)) |
| KJV for UK users | Crown letters patent restrict it in the UK ([ebible.org](https://ebible.org/KJV/copyright.htm)) |
| Modern copyrighted translations (NIV, ESV, NLT, NASB, …) | Licence needed |
| Quotations from memory | Any quote from a theologian or saint must come from a recorded public-domain source (Phase 4) |
