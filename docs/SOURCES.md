# sholam data sources and licences

Last updated: 2026-11-14

Only data listed here as **in use** or **approved** may ship. Researched 2026-11-14 through the research pool; "checked" means the primary page was read.

## In use

| Data | Licence | Where | Notes |
|---|---|---|---|
| Berean Standard Bible (BSB) | Public domain, CC0, dedicated 2023-04-30 ([berean.bible/terms.htm](https://berean.bible/terms.htm), checked; [CrossWire](https://www.crosswire.org/sword/copyright/ModInfoCopyright.jsp?modName=BSB)) | Imported from [BSB-publishing/bsb2usfm](https://github.com/BSB-publishing/bsb2usfm) release **v5.19** (2026-10-27), asset `BSB_usj.zip`, sha256 `783aced3c3c8a2b145e4f8c48e3b94a5a5515e050719bb8621d094be78a5269f`. Cross-checked against [bible.helloao.org](https://bible.helloao.org/docs/) | 31,086 verses. Wording is unchanged; the extractor fixes only layout and spacing artefacts of the conversion (below), so the "Berean" name request is respected |
| Seed flashcards (`data/flashcards.seed.json`) | Written for sholam | This repo | 50 fact cards; every answer, quotation and ref checked against the imported verse text on 2026-11-14 |
| FaithMap discover questions (`data/sources/faithmap_132_curated_questions.md` → `data/faithmap.cards.json`) | Provided by the sholam team for this project (2026-11-14) | This repo (public) and the public deck | 132 entries, of which 3 repeat earlier questions with the same Scripture, so 129 cards. Open questions with Scripture starting points and no answers, for ages about 13–20. Every reference resolves in `verses`. The source's editorial notes (starting points are not proof; separate text, history, interpretation and disagreement; handle violent passages with care) are carried into the agent prompt |

### BSB v5.19 conversion quirks handled by `src/lib/bible/usj.ts`

1. Psalm superscriptions sit after the verse 1 marker; they are headings in English Bibles and are left out of verse 1. A closing `d` later in a chapter (Hab 3:19) stays in the verse.
2. The space between two words is lost where a footnote sits between them (119 places: "Blessed<note>are", "Samuel,<note>saying"); it is restored.
3. Two closing marks (`’’`) are appended to the last verse of 59 chapters whose quotation continues into the next chapter; they are removed (Exodus 20:26 keeps its one real `’`).
4. Em dashes are closed, as printed.
5. Two typos join punctuation to the next word (Num 6:23 "sons:This", Jer 29:19 "LORD,which"); a space is added.

Result: 305 of 306 randomly sampled verses match helloao exactly; the remaining one differs only in `…` vs `...`.

## Approved for later phases

| Data | Licence | Notes |
|---|---|---|
| World English Bible (WEB) | Public domain ([ebible.org FAQ](https://ebible.org/eng-web/webfaq.htm), checked) | "World English Bible" is a trademark: use the name only for unchanged text |
| ASV (1901) | Public domain by age | Dated English; low priority |
| Easton's Bible Dictionary (1897) | Public domain ([CrossWire](https://crosswire.org/sword/modules/ModInfo.jsp?modName=Easton)) | JSON at [JWBickel/BibleDictionaries](https://huggingface.co/datasets/JWBickel/BibleDictionaries) |
| OpenBible.info cross-references (~340k) and topical index | **CC BY 4.0**: "Unless otherwise indicated, all content is licensed under a Creative Commons Attribution License", linking `creativecommons.org/licenses/by/4.0/` ([cross-references](https://www.openbible.info/labs/cross-references/), [topics](https://www.openbible.info/topics/), checked 2026-11-14) | Needs visible attribution wherever results show. Votes can be negative and about a quarter of targets are ranges; filter by vote count |
| Treasury of Scripture Knowledge | Public domain ([CrossWire TSK](https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=TSK)) | ~500k cross-references; older and noisier than OpenBible |
| BSB section headings | Public domain (part of the BSB release; also `headings.jsonl` in [BSB-publishing/bsb-data](https://github.com/BSB-publishing/bsb-data), CC0) | 3,086 `s1`/`s2` headings in v5.19; powers passage search (SEARCH.md) |

## Pending a licence check

| Data | Issue |
|---|---|
| BSB Strong's numbers (`BSB_strongs_usj.zip`, v5.19) | The bsb2usfm README marks the whole release public domain, and each word carries its number (John 3:16 "loved" → `G25`). Clear Bible's [licence page](https://www.clearbible.ai/licenses) traces the word-level alignment partly to CC BY 4.0 (TAHOT/TAGNT) and CC BY-SA (Open Scriptures dictionaries) sources. Check file by file and keep attributions before shipping word studies |
| STEPBible-Data (TAGNT, TAHOT, lexicons) | CC BY 4.0 per the repo; confirm per file before use |
| Nave's Topical Bible | The 1897 work is public domain, but the CSV transcriptions found carry conflicting licences (CC BY 4.0 vs CC BY-NC-SA 4.0). Use an original-source copy or skip |

## Do not use

| Data | Why |
|---|---|
| API.Bible | Commercial plan required, cached content must refresh every 30 days, analytics required, LLM use of content prohibited ([terms](https://api.bible/terms-and-conditions)) |
| KJV for UK users | Crown letters patent restrict it in the UK ([ebible.org](https://ebible.org/KJV/copyright.htm)) |
| Modern copyrighted translations (NIV, ESV, NLT, NASB, …) | Licence needed |
| Quotations from memory | Any quote from a theologian or saint must come from a recorded public-domain source (Phase 4) |
