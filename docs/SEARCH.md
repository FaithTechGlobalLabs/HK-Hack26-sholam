# sholam Bible search

Last updated: 2026-11-14

How sholam's agent finds Bible passages: **agentic search** (the model plans queries, calls search and read tools, checks what it found, and refines) over indexes we build from public-domain data, rather than answering from what the model remembers. The model's memory is allowed to *propose* where to look ("I think this is Philippians 4"); only tool results may be *quoted or cited*.

Companion docs: [HARNESS-UI.md](HARNESS-UI.md) (tool lifecycle, `search_result` citations, UI), [ARCHITECTURE.md](ARCHITECTURE.md), [SOURCES.md](SOURCES.md).

## 1. Recommendations at a glance

1. **Agentic search over several small indexes, not one vector store.** Verses (full-text), section headings (passages), and later embeddings, Strong's numbers and cross-references. The agent picks and combines them.
2. **Add BSB section headings now.** On our 25-question baseline, searching the 3,086 headings found the right passage for 17/25 questions; verse full-text alone found 12/25; the two together found **24/25**.
3. **Two core tools in Phase 2:** `search_bible` (one call returns matching passages and matching verses) and `read_passage` (read a verse with context, a range, a section or a chapter). `lookup_verses` stays for exact references.
4. **A written search policy** in the system prompt: classify the question, search with the user's words and one or two rewrites in parallel, read the passage around any hit before quoting, refine on weak results, stop within a budget, and say plainly when nothing was found.
5. **Hybrid semantic search in Phase 3**, after the keyword baseline is measured in the live loop: verse embeddings (pgvector, HNSW) fused with full-text by Reciprocal Rank Fusion. Embedding all 31,086 verses costs cents.
6. **Word studies and cross-references in Phase 4**: Strong's numbers are already in the BSB release (public domain), cross-references from OpenBible (CC BY 4.0) or the public-domain Treasury of Scripture Knowledge.
7. **Measure everything** against a gold set (`data/search-eval.json`, 25 questions today, growing) at two levels: retrieval recall per index, and whether the agent's final citations include a gold verse.

## 2. Why agentic search

| Evidence | What it says | Source |
|---|---|---|
| Claude Code | Early versions used RAG with a local vector database; "agentic search generally works better" | [Boris Cherny on X](https://x.com/bcherny/status/2017824286489383315) |
| Keyword tools in an agent loop | Plain keyword search tools inside an agent reach over 90% of RAG quality without a vector database (faithfulness 94.5%, context recall 88.1%, answer correctness 91.5% of the RAG baseline; small datasets, RAGAS metrics) | [arXiv 2602.23368](https://arxiv.org/abs/2602.23368) |
| Interleaved retrieval | Interleaving retrieval with reasoning (IRCoT) improved retrieval recall by up to 21 points and QA by up to 15 on multi-hop benchmarks | [arXiv 2212.10509](https://arxiv.org/abs/2212.10509) |
| Hybrid retrieval | Anthropic's Contextual Retrieval: embeddings plus BM25 cut top-20 retrieval failures by 49%; adding a reranker, by 67% | [Anthropic](https://www.anthropic.com/research/contextual-retrieval) |
| Tool design | Spend effort on the tools more than the prompt; keep responses concise with an option for more detail; evaluate on held-out tasks | [Building effective agents](https://www.anthropic.com/research/building-effective-agents), [Writing tools for agents](https://www.anthropic.com/research/writing-tools-for-agents) |
| Bible software | Mature tools layer keyword/phrase, heading, topical, cross-reference and Strong's/lemma search; STEP Bible exposes `heading:`, `strong:` and Nave's topical prefixes; Logos offers "Smart" natural-language plus "Precise" lemma/morph search | [STEP guide](https://stepbibleguide.blogspot.com/p/advanced-search.html), [Logos](https://support.logos.com/hc/en-us/articles/360017808111-Bible-Search), [Blue Letter Bible](https://www.blueletterbible.org/help/conc.cfm) |

What this means for sholam: Bible questions come in several shapes (an exact phrase, a story, a topic, a word study, "what did Jesus say about…"), and no single index serves all of them. An agent that can try a phrase search, fall back to headings, rewrite "anxiety" as "anxious OR worry", and then read the surrounding verses beats any one-shot retrieval. Our corpus is small (31,086 short verses), so every index fits easily in Postgres, and there is no reason to give up precise keyword search for embeddings alone.

Caveat: the published gains are for document chunks, not verses, and the agentic-vs-RAG comparisons are on small datasets. Hence §7: we measure on our own questions.

## 3. Baseline on our data (2026-11-14)

`npm run search:baseline` runs 25 natural-language questions from `data/search-eval.json` against the live BSB table. A question counts as found if any gold verse is in the top 10 (verse search) or inside one of the top 3 matching sections (heading search).

| Strategy | Found |
|---|---|
| Verse full-text, all terms (`websearch_to_tsquery`) | 12/25 |
| Verse full-text, any term (OR), ranked by `ts_rank_cd` | 11/25 |
| Section headings (top 3) → verses in those sections | 17/25 |
| **Verse full-text (all terms) ∪ headings** | **24/25** |

Where each wins:

- **Headings win on stories and named passages**, where the question's words are not in the verses: "the prodigal son comes home" → *The Parable of the Prodigal Son*; "Jesus raises Lazarus", "the Lord's Prayer", "Nicodemus comes to Jesus at night" → *Jesus and Nicodemus*.
- **Verse search wins on wording**: "God so loved the world", "love is patient and kind", "fruit of the Spirit", "go and make disciples of all nations". Heading search for these lands on unrelated sections (*God's Love for Israel*).
- **Both miss topical questions phrased conversationally**: "what does the Bible say about anxiety" matches 0 verses with all terms, and the any-term search is swamped by "say". The agent's natural next step fixes it: the rewrite `anxious OR worry OR anxiety` returns 37 verses with Matthew 6:34 ranked first. That rewrite step is the agentic part; embeddings (Phase 3) will help here too.

Limits of this baseline: 25 hand-picked questions with well-known answers, binary hit/miss, section hits are passages (the agent still has to read them), and no semantic index yet.

## 4. Indexes

All in Supabase Postgres, built from public-domain or CC BY data. A global verse position (`verses.pos`, 1…31,086 in canonical order) makes ranges, context windows and section membership simple integer comparisons.

| Index | Answers | Data | Phase |
|---|---|---|---|
| Verse full-text (exists) | exact words, phrases (`"..."`), OR, exclusions | `verses.search` tsvector, GIN | done |
| **Sections** | stories, parables, named passages | 3,086 BSB `s1`/`s2` headings with start/end verse | 2 |
| Typo tolerance | misspelled names ("Nicodemas", "Zaccheus") | `pg_trgm` on book names, headings and proper nouns | 2 |
| Semantic | topics and paraphrases ("feeling far from God") | one embedding per verse, prefixed with its section heading for context; pgvector HNSW | 3 |
| Strong's | word studies ("which 'love' is this?") | per-word Strong's numbers in `BSB_strongs_usj.zip` (e.g. John 3:16 "loved" → G25) | 4 |
| Cross-references | "where else is this?" | OpenBible (CC BY 4.0) or TSK (public domain) | 4 |
| Topical | "verses about hope" | OpenBible topics (CC BY 4.0), Nave's from a verified public-domain copy | 4 |

Notes:

- **Sections table:** `sections(translation, id, book, heading, level, start_pos, end_pos, search tsvector)`. Extracted in the same pass as verses (the BSB USJ has the headings; our importer currently skips them). BSB also publishes `headings.jsonl` in [BSB-publishing/bsb-data](https://github.com/BSB-publishing/bsb-data) (CC0) as a cross-check. Some headings repeat across the Gospels (*Jesus Calms the Storm* appears three times); that is a feature: the agent gets all parallel accounts.
- **Semantic index:** embed `"{heading} — {book} {c}:{v} {text}"` per verse, so short verses carry their passage context (a cheap version of Contextual Retrieval). About 1.1–1.4M tokens in total: roughly $0.07 with Voyage `voyage-4`, $0.03 with OpenAI `text-embedding-3-small`, or free with an open model such as Qwen3-Embedding-0.6B (Apache-2.0) run locally. Provider choice needs an account and a key (§9).
- **Hybrid ranking:** run full-text and vector search separately, fuse with Reciprocal Rank Fusion (`score = Σ 1/(k + rank)`, k = 50–60), the pattern in [Supabase's hybrid search guide](https://supabase.com/docs/guides/ai/hybrid-search). Boost verses that sit inside a matched section. A reranker (e.g. Voyage `rerank-2.5`) is optional; measure first.
- **Strong's licensing:** the bsb2usfm README marks the whole release public domain, but Clear Bible's licence page traces the word-level Strong's alignment partly to CC BY / CC BY-SA sources. Check file by file and keep attributions before redistributing that layer (SOURCES.md).

## 5. Tools the agent gets

Tool results go back to the model as `search_result` blocks (one per verse or passage, `source: "bsb:JHN.3.16"`), so the API can only cite what the tools returned (HARNESS-UI.md §4). Results are short by default; ids are always included so the next call can build on them.

```ts
// Phase 2
search_bible({
  query: string,                 // user words or a rewrite; supports "exact phrase", OR, -exclude
  scope?: { testament?: "OT" | "NT"; books?: string[]; from?: string; to?: string },
  limit?: number,                // verses, default 8, max 20
}) → {
  passages: { id: string; heading: string; range: string; firstVerse: string }[], // top 3 sections
  verses:   { id: string; label: string; text: string; heading: string }[],       // ranked
  note?: string,                 // e.g. "0 verses matched all words; showing any-word matches"
}

read_passage({
  ref: string,                   // "JHN.3.16", "LUK.15.11-LUK.15.32", "PSA.23", or a section id
  context?: number,              // verses before/after a single verse, default 2, max 10
}) → { heading: string; verses: { id: string; text: string }[] }   // cap ~80 verses

lookup_verses({ references: string[] })   // human refs ("1 Cor 13:4-7"), via parseReference

// Phase 4
word_study({ strongs?: string; word?: string; scope?: ... })  // occurrences + English renderings
cross_references({ verse: string, limit?: number })
```

`search_bible` behaviour, so the agent doesn't have to orchestrate it:

1. Full-text on verses with all terms; if fewer than `limit` hits, add any-term hits, ranked lower.
2. Full-text on headings (top 3), returned as passages.
3. Phase 3: vector search fused in by RRF.
4. Group adjacent hits into ranges in the UI channel; the model channel gets individual verses.

## 6. Search policy (system prompt)

The agent follows this loop, with a budget of about 6 search/read calls per answer:

1. **Classify** the question: quote ("where does it say…"), story ("the one where…"), topic ("what does the Bible say about…"), word ("what does 'grace' mean"), or reference ("explain Romans 8:28").
2. **Search in parallel** in one turn: the user's words plus one or two rewrites (key nouns, synonyms, BSB-style wording, names). Use memory only to guess references, then `lookup_verses` to check them.
3. **Read before quoting**: `read_passage` around each hit you intend to use, so a verse is never quoted against its context.
4. **Refine** when results are weak: different words, a narrower scope (one book, one testament), or a heading search for the story's name.
5. **Cover the range** on doctrinal or contested topics: several passages, both testaments where relevant, and note where Christian traditions read them differently.
6. **Stop** when the answer is supported, or the budget is spent. If nothing fits, say so; never fill the gap from memory.

Discover cards (open questions such as the FaithMap set) carry Scripture *starting points*: read them first, then search beyond them, and keep separate what the text says, what history shows, how Christians interpret it, and where they disagree.

## 7. Evaluation

- **Retrieval:** `data/search-eval.json` with gold verse ids; report recall@10 per index and for the fused `search_bible`. Grow it to 100+ questions across the five question shapes, including false premises ("where does the Bible say God helps those who help themselves?"; the right answer is that it doesn't). [Aion-BibleQA](https://raoufabedini.dev/aion-bibleqa-citation-faithfulness-bible-rag.pdf) (40 items with gold verses) is a useful outside check once its licence is confirmed.
- **Agent level:** run the real loop on the same questions and score (a) whether a gold verse is cited, (b) every quote matches `verses.text` exactly, (c) no unverified citations, (d) tool calls per answer.
- Targets before turning on semantic search by default: `search_bible` recall@10 ≥ 90% on the eval set; quote accuracy 100%.

## 8. Phasing

| Phase | Search work |
|---|---|
| 2 | `verses.pos`; `sections` table from the importer; `search_bible` (verses + headings + any-term fallback); `read_passage`; `parseReference` + `lookup_verses`; search policy in the prompt; eval script on the real loop |
| 3 | Embeddings + RRF hybrid; `pg_trgm` for names; grow the eval set; decide on a reranker from measurements |
| 4 | Strong's word study (after the licence check), cross-references and topics (OpenBible CC BY 4.0 with attribution, or TSK) |

## 9. Open questions

1. **Embedding provider** (Phase 3): Voyage (Anthropic's recommended partner; needs an account and key), OpenAI, or an open model run locally. Any of them is cheap; it is an account and data-flow decision.
2. **Strong's layer:** worth a file-by-file licence check now, or wait until word studies are scheduled?
3. **Cross-references:** OpenBible (CC BY 4.0, needs attribution in the UI) or TSK (public domain, older and noisier)?
4. **Red-letter text:** the same importer pass that adds sections can keep `wj` (words of Jesus) spans, which also enables "what did Jesus say about…" searches.
