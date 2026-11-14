# sholam harness and agent UI

Last updated: 2026-11-14

> Status note (2026-11-14): search tools and the search policy are specified in [SEARCH.md](SEARCH.md), which builds on §3–4 here. A first non-basic card kind now exists: `discover` cards (open questions with Scripture starting points, the FaithMap set), stored with `kind = 'discover'`. The kind names in §5 should extend that union.

Design for the next version of sholam's chat harness and the custom UI it drives: how verse citations look in several formats, and how the agent proposes flashcards or asks the user for input (multiple choice, true/false, fill-in-the-blank, short and long answers). This is a design document only; nothing here is built yet. Where it changes code, the snippets show the intended shape.

It builds on the current skeleton: the manual streaming loop and SSE events (`src/lib/agent/harness.ts`, `events.ts`), the four tools, the `verse:` citation links (`citations.ts`), and `flashcardDraftSchema` (`src/lib/flashcards/types.ts`). The rules in `AGENTS.md` stand: scripture only from tools, the agent never saves a card, tools and prompt stay cache-stable, history is append-only.

## 1. Recommendations at a glance

1. **Keep the manual loop and a closed catalog of host-rendered components.** Every tool has a typed UI payload and a known React component. No iframes and no model-authored UI.
2. **Split each tool's output into two channels.** The model channel is a short `tool_result`. The UI channel is rich typed events, persisted with the message.
3. **Give every tool call one lifecycle on the wire:** input streaming → input ready → output or error, with a paused "awaiting user" state for questions. This mirrors the AI SDK and AG-UI states.
4. **Try Claude's native citations for verses.** `lookup_verses` and `search_bible` return one `search_result` block per verse, so citations come back structured and can only point at verses we supplied. Keep the `verse:` link as a display directive for passage blocks.
5. **Citations render as typeset references, not tinted pills.** The formats are an inline reference with a popover (a bottom sheet on mobile), a scripture block for quoted passages, a range card, a numbered verse list for long answers, the Sources panel, and explicit unverified and pending states.
6. **Add an `ask_user` tool** with a small, closed set of question kinds: single choice, multiple choice, short text, long text, confirm. It pauses the loop, and the answer returns as that call's `tool_result`. A message the user types instead closes the question as `skipped`.
7. **Make `propose_flashcard` a discriminated union by `kind`:** basic, multiple_choice, true_false, fill_blank, short_answer, long_answer. Each kind has a proposal, an edit and a study layout. Proposal outcomes (saved, edited, dismissed) live in their own table, outside the append-only history.
8. **Phase 2** ships the lifecycle, the citations, `ask_user`, and proposals for basic, multiple choice and true/false. **Phase 3** ships fill-in-the-blank, short and long answers, per-kind study and grading, and the full editor.

## 2. What current practice says (sources)

Researched 2026-11-14 through the research pool (`free_only`). "Read" means the page itself was read; "snippet" means only search results were seen.

### 2.1 The tool loop (Anthropic)

- The loop runs on `stop_reason`: `tool_use` means run the tools and continue; `end_turn`, `max_tokens`, `stop_sequence` and `refusal` end the turn. Read: [How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).
- Each `tool_use` needs exactly one `tool_result` with its `tool_use_id`. The results go **first** in the next user message, with nothing in between, and failures return `is_error: true` with an instructive message. Read: [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).
- Parallel calls arrive in one assistant turn. A call you choose not to run still needs a `tool_result` (`is_error: true`, "Not executed"). `disable_parallel_tool_use` lives inside `tool_choice`. Read: [Parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use).
- On Opus 5.5, `tool_choice` `any` and `tool` return a 400; use `auto` and steer from the prompt. Snippet: [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools). This matches the current `claude-api` skill guidance.
- `strict: true` constrains `input` to the schema. A course page reports limits on strict schemas (no length or min/max bounds, caps on optional and `anyOf` parameters). Snippets: [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use), [Claude Academy lesson](https://academy.claude.com/courses/tool-use-with-the-messages-api/strict-tool-use). **Implication:** keep zod as the validator, and don't count on `strict` for sholam's bounded schemas until it has been tested.
- Tool design guidance: few high-impact tools, high-signal return fields instead of opaque ids, paginated and filtered results, and errors that say what to do next. Read: [Writing effective tools for agents](https://www.anthropic.com/research/writing-tools-for-agents). Keep tool sets small, because ambiguous tool choice is a common failure. Partly read: [Effective context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents).

### 2.2 Streaming tool input

- `eager_input_streaming: true` on a user-defined tool streams its input as `input_json_delta` events carrying `partial_json` fragments, between `content_block_start` and `content_block_stop`. Without it the API buffers and validates each parameter first. With it, the input may be invalid or truncated (for example at `max_tokens`), so parse on block stop and validate before running anything. Read: [Fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming).
- **Implication:** turn it on only for `propose_flashcard`, whose input is long enough to be worth drawing as it streams. Small lookup tools gain nothing from it.

### 2.3 Native citations

- Custom tools can return `search_result` blocks inside `tool_result`. Each has a required `source` (any stable string, such as an internal id) and `title`, text-only `content`, and `citations: {enabled: true}`. Citations are off by default, and every search result in a request must use the same setting. Read: [Search results](https://platform.claude.com/docs/en/build-with-claude/search-results).
- With citations on, the response comes back as several `text` blocks; the cited ones carry a `citations` array. Search-result citations have type `search_result_location` and carry `cited_text`, `source`, `title` and block indices. Custom content is not re-chunked, so one block per verse means one citable unit per verse. `cited_text` doesn't count toward output tokens, or toward input tokens when replayed. Prompts that ask for JSON only get few or no citations. In streaming, each citation arrives as a `citations_delta` inside `content_block_delta`. Read: [Citations](https://platform.claude.com/docs/en/build-with-claude/citations).
- **Implication:** the API can only cite verses our tools returned, which is the guarantee sholam's first product rule asks for. See §4.1.

### 2.4 Asking the user structured questions

- **Claude Agent SDK `AskUserQuestion`.** It takes 1–4 questions, each with a `header` (max 12 characters), 2–4 `options` (a `label` and `description` each) and `multiSelect`. The host intercepts it in `canUseTool` and answers with `updatedInput.answers`, which maps each question to the chosen label(s), with free text for "Other". The callback can stay pending indefinitely. Read: [Agent SDK user input](https://code.claude.com/docs/en/agent-sdk/user-input).
- **Vercel AI SDK.** Tool parts are typed `tool-<name>` with the states `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error` and `output-denied`. A client-side tool with no `execute` waits in `input-available` until the app calls `addToolOutput`, and `sendAutomaticallyWhen` resubmits once every output exists. Read: [Chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage). Tool approval (`needsApproval`): snippet, [AI SDK v6 human-in-the-loop](https://ai-sdk.dev/v6/cookbook/next/human-in-the-loop).
- MCP elicitation, MCP Apps, the OpenAI Apps SDK, A2UI and AG-UI: see §2.6.

### 2.5 Citation, Bible-reference and quiz UX

- Put a citation next to the claim it supports, label it with the source's name rather than "Source", and link to the passage. People rarely click citations, so well-cited output gets over-trusted. Snippet: [NN/G, Explainable AI](https://www.nngroup.com/articles/explainable-ai/). Users struggle to tell which claim came from which citation when uncited synthesis sits in the same block. Snippet: [NN/G, AI search](https://www.nngroup.com/articles/ai-search-infoseeking/).
- ChatGPT puts inline markers after claims, with hover previews and a "Sources" control that opens a right-hand panel (read during sholam's planning research: [Searching the web with ChatGPT](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt)). Perplexity leads with numbered source cards; NN/G warns that sources shown above the answer can lend a false halo of truth. Snippet: [NN/G, AI hallucinations](https://www.nngroup.com/articles/ai-hallucinations/).
- Bible sites follow the same split. Logos RefTagger turns references into links with a hover tooltip showing the verse text and supports ranges. Read: [RefTagger features](https://www.logos.com/reftagger/features). Bible Gateway's tooltips can open on hover or click. Snippet: [Bible Gateway tooltips](https://www.biblegateway.com/share/tooltips/). Bible Gateway compares up to 5 translations side by side and keeps cross-references behind a setting, not on hover. Snippet: [Bible Gateway tutorial](https://www.biblegateway.com/help/tutorial/). Blue Letter Bible added a parallel view on the web in 2026. Snippet: [BLB blog](https://blogs.blueletterbible.org/blb/2026/04/06/parallel-web-view/).
- Quiz formats: Quizlet's study modes use multiple choice, true/false and written answers. Quizlet's own design post says it removed true/false and "none of the above" from one mode, because a 1-in-2 guess teaches little and players quit more, and it uses typed recall as the main format. Snippets: [Quizlet Learn](https://quizlet.com/features/learn), [Quizlet blog](https://quizlet.com/blog/selecting-question-formats-to-maximize-the-testing-effect). Anki's built-in note types are Basic, Basic (and reversed) and Cloze (`{{c1::...}}`). Snippet: [Anki manual](https://docs.ankiweb.net/manual/editing).
- Retrieval practice works. Recall formats (short answer) tend to beat multiple choice, but the gap is small once feedback is given (Smith & Karpicke 2014 report d ≈ 0.07). Snippets: [Roediger & Karpicke 2006](https://learninglab.psych.purdue.edu/downloads/2006/2006_Roediger_Karpicke_Review.pdf), [Karpicke 2017](https://learninglab.psych.purdue.edu/downloads/2017/2017_Karpicke_Retrieval_Based_Learning_Review.pdf). **Implication:** feedback with the verse after every answer matters more than which format is used.
- Accessibility: multiple-choice options are a WAI-ARIA radio group. Arrow keys move and check, Tab enters on the checked radio, and the group carries `role="radiogroup"` with a label. Read: [APG radio group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/).

### 2.6 Protocols for agent-driven UI

- **MCP elicitation.** Form mode has existed since the 2025-06-18 spec; URL mode was added in 2025-11-25 (SEP-1036). Read: [changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog).
  - Form requests carry a `message` and a `requestedSchema` that must be a flat object of primitive fields: string (length, pattern, format), number or integer, boolean, single-select enum, or multi-select enum array. No nested objects. Read: [Elicitation 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation).
  - The reply is `action: "accept"` (with `content`), `"decline"` (an explicit no) or `"cancel"` (dismissed without choosing). Snippets: [2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation), [draft](https://modelcontextprotocol.io/specification/draft/client/elicitation).
  - Servers must not use form mode for passwords, API keys, tokens or payment credentials. Clients must show who is asking, offer clear decline and cancel options, and let users review and edit a form before sending. Read: same page.
  - A 2026-07-28 revision exists and was only partly read.
- **MCP Apps (SEP-1865).**
  - A tool links to a `ui://` HTML resource through `_meta.ui.resourceUri`. The host renders it in a sandboxed iframe and talks to it over JSON-RPC via postMessage. Read: [SEP-1865](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp.md).
  - The extension repo lists spec 2026-01-26 as stable. Read: [ext-apps](https://github.com/modelcontextprotocol/ext-apps).
  - ChatGPT implements the standard. Read: [OpenAI, ChatGPT UI](https://developers.openai.com/plugins/build/chatgpt-ui).
- **OpenAI Apps SDK.**
  - A tool result splits into three parts: `structuredContent` goes to the model and the widget and must match `outputSchema`; `content` goes to the model and the transcript; `_meta` goes only to the widget. Read: [reference](https://developers.openai.com/plugins/reference).
  - Widgets use `window.openai` (`toolInput`, `toolOutput`, `setWidgetState`, `callTool`, `sendFollowUpMessage`, display-mode requests). Read: same page.
  - UX guidance: inline cards are for a single decision or a small piece of data, with at most two actions and no nested scrolling; fullscreen is for multi-step tasks. Snippet: [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines). Claude's MCP Apps guidelines similarly cap inline cards at two actions and 4–5 data points. Snippet: [Claude MCP Apps design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines).
- **AG-UI 1.0** (2026-09-30) is an event transport between agent and UI, not a UI format. Read: [AG-UI 1.0](https://www.copilotkit.ai/blog/ag-ui-1.0), [events](https://docs.ag-ui.com/concepts/events).
  - Event families: `TEXT_MESSAGE_START/CONTENT/END`, `TOOL_CALL_START/ARGS/END/RESULT`, `STATE_SNAPSHOT` / `STATE_DELTA` (JSON Patch) and `RUN_STARTED/FINISHED/ERROR`, plus human-in-the-loop interrupts. The full enum is a snippet: [schema](https://docs.ag-ui.com/spec/1.0/schema).
- **A2UI v1.0** (Google). The agent describes a surface with `createSurface`, `updateComponents`, `updateDataModel` and `deleteSurface`, using only components from a catalog that the renderer advertises, and never sends raw HTML. Read: [spec](https://a2ui.org/specification/v1.0-a2ui/), [catalogs](https://a2ui.org/concepts/catalogs/). The official page marks v1.0 current (updated 2026-06-08); some secondary sources still call it a release candidate.

**What sholam takes from these:**

- `ask_user` copies elicitation's small primitive schema, its three outcomes (answered, declined and skipped correspond to accept, decline and cancel), "review before send", and "never ask for secrets".
- The model/UI split in §3.2 is the Apps SDK's `structuredContent` / `_meta` idea.
- Proposal cards keep to two actions plus a close control.
- The tool-call lifecycle in §3.3 maps one-to-one onto AG-UI (`tool_call_start` → `TOOL_CALL_START`, `tool_input_delta` → `ARGS`, `tool_call_ready` → `END`, `tool_output` → `RESULT`). That keeps a later move to AG-UI cheap if a second client, such as a mobile app, ever appears. Adopting it now adds nothing.
- The fixed component catalog is A2UI's safety idea, without letting the model compose layouts.

### 2.7 Retrieval gaps

- Read as snippets only:
  - Anthropic: the Define tools and Strict tool use pages.
  - Other platforms: the AI SDK approval docs, elicitation response actions, the OpenAI and Claude inline-card guidelines, and the full AG-UI event enum.
  - Bible and quiz sites: Quizlet, Bible Gateway, Blue Letter Bible, and Anki's cloze section.
  - Research: the retrieval-practice studies, cited through reviews.
- Partly read: the 2026-07-28 MCP elicitation revision, and the MCP Apps method list.
- Not found: a primary description of Claude.ai's citation UI, and YouVersion's verse UI.
- Not checked:
  - Whether an AI SDK version newer than v6 exists.
  - The exact placement of `eager_input_streaming` in the TypeScript SDK 1.x types.
  - Which hosts besides ChatGPT support MCP Apps (only secondary sources were found).

## 3. Harness design

### 3.1 Architecture choice: a closed component catalog

sholam is one first-party app with one design system and strict content rules. The UI the agent can trigger should therefore be a **fixed set of React components, each owned by a tool and keyed by its name and payload kind**. That is the AI SDK's typed-tool-part model, carried over sholam's own SSE stream.

| Approach | Fit for sholam |
|---|---|
| Typed tool results rendered by the host (AI SDK tool parts, today's events) | **Chosen.** Full design control, accessible, testable, no third-party code |
| Iframe widgets (MCP Apps, OpenAI Apps SDK) | Built for third-party apps inside someone else's host; sandboxing and messaging cost with no benefit here |
| Model-authored declarative UI (A2UI-style JSON trees) | Too open. The model would be designing screens, and every layout would need validating |

What sholam borrows:

- From **MCP elicitation**, a deliberately small question schema and three-way outcomes (answered, declined, dismissed).
- From the **AI SDK** and **AG-UI**, one lifecycle per tool call, so the client renders from state instead of from ad-hoc events.
- From the **Apps SDK**, separate content for the model and for the UI. This is already how sholam's tools work (`run()` returns text; `ctx.emit()` sends UI).

### 3.2 Two channels per tool

```
                ┌─────────────── model channel ───────────────┐
tool.run(input) ┤  tool_result: short text or search_result     │ → next API request
                └─────────────── UI channel ──────────────────┘
                   ctx.emit(AgentEvent ...)                     → SSE → React component
                                                                → persisted in messages.ui
```

- The model sees only what it needs to reason: verse text, card ids and questions, "proposal shown". Keep it small; it is replayed on every later turn.
- The UI gets everything it needs to render, now and when the chat is reopened. Persist the events emitted while producing an assistant row in a new `messages.ui jsonb` column, written once with the row. The row stays append-only.
- Mutable outcomes, such as a proposal being saved or dismissed, go in their own table (§3.6). The transcript is never edited.

### 3.3 One lifecycle per tool call

```
tool_call_start ──► tool_input_delta* ──► tool_call_ready ──► tool_output │ tool_error
   (id, name)        (partial input,       (validated           (typed UI payload
                     propose_flashcard      input)               keyed by tool + kind)
                     only)                     │
                                               └──► awaiting_user (ask_user only; turn ends,
                                                    resumes when the answer is POSTed)
```

The client keeps a `Map<toolCallId, ToolPart>` per assistant message and renders each part by `name` and `state`. This replaces the separate `tool_start` / `tool_result` / `verses` / `flashcards` / `flashcard_proposal` handling with one switch. Text deltas and citations stream alongside.

### 3.4 Event contract (replaces `events.ts`)

```ts
// src/lib/agent/events.ts (proposed)
import type { FlashcardDraft, FlashcardSummary } from "@/lib/flashcards/types";
import type { AskUserAnswer, AskUserRequest } from "@/lib/agent/tools/ask-user";

export interface VerseRecord {
  id: string;            // "JHN.3.16"
  label: string;         // "John 3:16"
  text: string;
  translation: string;   // "BSB"
}

/** Typed UI payloads, one per tool. The client picks a component by `tool`. */
export type ToolOutput =
  | { tool: "lookup_verses" | "search_bible"; verses: VerseRecord[] }
  | { tool: "search_flashcards"; cards: FlashcardSummary[] }
  | { tool: "propose_flashcard"; proposalId: string; draft: FlashcardDraft }
  | { tool: "ask_user"; answer: AskUserAnswer };

export type AgentEvent =
  | { type: "text_delta"; block: number; text: string }
  | { type: "citation"; block: number; verseId: string; citedText: string }   // from citations_delta
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_input_delta"; id: string; partial: unknown }                 // tolerant-parsed, throttled
  | { type: "tool_call_ready"; id: string; name: string; input: unknown }
  | { type: "tool_output"; id: string; output: ToolOutput; summary: string }
  | { type: "tool_error"; id: string; message: string }
  | { type: "user_input_request"; id: string; request: AskUserRequest }
  | { type: "done"; messageId: string; stopReason: StopReason; citations: CitationReport }
  | { type: "error"; message: string };

export type StopReason = "end_turn" | "awaiting_user" | "max_tokens" | "refusal" | "step_limit";

export interface CitationReport {
  verified: string[];    // verse ids cited and fetched this turn
  unverified: string[];  // verse ids written as verse: links but never fetched
  unmatchedQuotes: string[]; // quoted passages that match no fetched verse (§4.1)
}
```

What changes for the client:

- Chips and citation states resolve from `tool_output` verses plus `citation` events while streaming. **Final verified or unverified status comes only from `done.citations`**; until then, a reference shows as pending, never as unverified.
- `tool_input_delta` is sent at most every ~100 ms, and only for `propose_flashcard`. The client draws a drafting card from it, but nothing is actionable until `tool_output` arrives with a validated draft.

### 3.5 `ask_user`: pausing the loop for a structured question

```ts
// src/lib/agent/tools/ask-user.ts (proposed)
export const askUserRequestSchema = z.strictObject({
  question: z.string().min(4).max(200),
  kind: z.enum(["single_choice", "multi_choice", "short_text", "long_text", "confirm"]),
  options: z
    .array(z.strictObject({
      label: z.string().min(1).max(60),
      description: z.string().max(140).optional(),
    }))
    .min(2).max(6).optional()
    .describe("Required for single_choice and multi_choice"),
  allowOther: z.boolean().default(true).describe("Adds a free-text 'Something else' choice"),
  placeholder: z.string().max(80).optional().describe("Format hint for text answers"),
});
export type AskUserRequest = z.infer<typeof askUserRequestSchema>;

export type AskUserAnswer =
  | { status: "answered"; choices?: string[]; text?: string }
  | { status: "declined" }   // user pressed "Skip"
  | { status: "skipped" };   // user typed a new message instead

// Cross-field rules live in one function (not in the JSON schema the model sees):
// choice kinds need options; confirm has none; at most one ask_user per turn.
export function validateAskUser(req: AskUserRequest): string | null { /* ... */ }
```

Tool description, short and directive: *"Ask the user one question when their answer changes what you do next (for example the format or difficulty of a flashcard, or which passage they mean). Never use it for permission to look things up, for personal or sensitive details, or more than once per turn."*

**Loop behaviour:**

1. The model ends a turn with `stop_reason: tool_use`, and one of the calls is `ask_user`. The server validates the request and runs any **other** calls from the same turn immediately (lookups, searches), storing their results.
2. The server emits `user_input_request` and persists the assistant row plus a `pending` record (`chat_id`, `tool_use_id`, stored sibling results). The stream ends with `done{stopReason: "awaiting_user"}`.
3. The answer arrives as `POST /api/chat {chatId, toolAnswer: {toolUseId, answer}}`. The server builds **one** user message: all stored sibling `tool_result` blocks, plus `{type: "tool_result", tool_use_id, content: JSON.stringify(answer)}`. Then it resumes the loop.
4. If the user ignores the question and types a message, the next user message is `[tool_result(skipped), text(message)]`. The `tool_result` goes first, as the API requires, so the history stays valid and append-only.

Nothing waits in server memory, so a reload or a closed tab just shows the open question again, rebuilt from `messages.ui` and the `pending` record.

### 3.6 `propose_flashcard`: a draft, never a save

- **Input:** `{ card: FlashcardDraft }` (§5). The union is wrapped in an object because a tool's root input schema must be an object. Turn on `eager_input_streaming` for this tool only.
- **Server:** parse with zod, run `validateDraft()` (§5.2), and check every ref exists in `verses`. If any of these fails, return `is_error: true` with a fixable message ("JHN.3.99 is not a verse; check the reference with lookup_verses"). If all pass, insert a `card_proposals` row and emit `tool_output{tool: "propose_flashcard", proposalId, draft}`.
- **Model channel:** `"Shown to the user as proposal <id>. They may edit, save or dismiss it; do not say it was saved."`
- **Outcomes are stored outside the transcript.** `card_proposals(id, chat_id, tool_use_id, draft jsonb, status: shown|edited|saved|dismissed, flashcard_id)`. Saving is `POST /api/flashcards {proposalId, draft}`, where the draft is the user's edited version.
- **The model learns the outcome on the next user turn.** The server puts a one-line note at the start of the next user message: `<ui_events>Proposal p_123 was saved as a multiple-choice card.</ui_events>`. This adds to history without editing it, and keeps the cached prefix intact. (A mid-conversation system message would also work on Opus 5.5, but it has placement rules; a note in the user turn is simpler.)

### 3.7 System prompt additions (still cache-stable)

- *"When the user wants to remember something, offer a card. If the best format is unclear, ask with ask_user (single_choice: basic flip, multiple choice, true/false, fill in the blank, short answer, reflection). Then call propose_flashcard."*
- *"For multiple choice, write distractors that are plausible but clearly wrong by the cited verses. Never 'all/none of the above'."*
- *"True/false statements must be decidable from the cited verses alone."*
- *"Long-answer cards are reflection prompts with key points, never a single doctrinal 'correct answer' where traditions differ."*

## 4. Citations: formats and where they go

### 4.1 Mechanism

**Proposed: native citations for verification, the `verse:` link for display.**

- `lookup_verses` and `search_bible` return, for each verse, `{type: "search_result", source: "bsb:JHN.14.27", title: "John 14:27 (BSB)", content: [{type: "text", text}], citations: {enabled: true}}`. The model's answer comes back with `search_result_location` citations on the claims it supports, and the API can only produce those for verses we supplied.
- `search_flashcards` may return its hits as search results too (`source: "card:<id>"`), so "according to the card…" is citable as well. Every search result in a request must use the same citation setting, so all tools enable it together.
- The `verse:` link stays, now as a **display directive**. A paragraph containing only a link, such as `[John 14:27](verse:JHN.14.27)`, renders as a scripture block. A range (`verse:1CO.13.4-7`) renders as a passage card. Inline `verse:` links remain allowed, and are checked against `versesSeen` as today.
- **Quote check (server, at `done`):** every span inside “curly quotes” in the answer is fuzzy-matched (normalised whitespace and punctuation, ≥ 90% token overlap) against the verse texts fetched this turn. A quote that matches nothing goes into `unmatchedQuotes` and is logged. It isn't removed, since the model may be quoting the user, but it feeds the eval set.

**Spike first (Phase 2, half a day).** Run 30 representative questions through both mechanisms. Compare citation coverage (claims with a verse attached), wrong-verse rate, the effect on reply length, and token cost. Adopt native citations if coverage is at least as good. Fallback: today's markdown links plus the quote check.

Range ids: extend `VerseId` to `BOOK.c.v[-v2]` within a chapter and `BOOK.c.v-c2.v2` across chapters. The server must have fetched every verse in the range for it to count as verified.

### 4.2 Which format where

| Where | Format | Notes |
|---|---|---|
| Chat answer, claim supported by a verse | **Inline reference** after the claim (the reference text itself, set in the body face with a tonal shift and a fine underline offset) | Opens a popover on hover after 800 ms, or instantly on focus or tap. A bottom sheet on touch |
| Chat answer, a verse quoted in full | **Scripture block** | Verse numbers as superscripts, reference set after the text, no decorative quote marks |
| Chat answer, 2+ consecutive verses | **Passage card** | First 3 verses shown, the rest behind "Show all 7 verses" |
| Long study answer, more than 5 distinct verses | **Numbered markers + verse list** at the end of the answer | Keeps the prose readable; the list carries the text |
| Any answer with fetched verses | **Sources panel** (desktop right), **bottom sheet** (mobile) | Opened from the message's action row |
| Flashcard back and study reveal | **Reference line** under the answer; tap opens a popover or bottom sheet with the text | Cards store ids only; text comes from `GET /api/verses?ids=` |
| Cited but never fetched | **Unverified reference** | Muted, dotted underline. The popover says "Not checked against the Bible text" and never shows text |
| While the answer streams | **Pending reference** | Neutral styling, no status; it resolves at `done` |

Later (Phase 4): **Compare** (BSB and WEB side by side) and **Related verses** (cross-references, once OpenBible's licence is confirmed) in the popover's lower row and the Sources panel. Red-letter words of Jesus need the importer to keep the BSB `wj` spans, which it currently flattens; that's a note for Phase 1, not a change made here.

### 4.3 Wireframes: citations

Desktop, inline reference with popover:

```
  Jesus speaks of a peace that is His own gift, not the world's
  John 14:27. He calls peacemakers blessed Matthew 5:9.
  ‾‾‾‾‾‾‾‾‾‾                               ‾‾‾‾‾‾‾‾‾‾‾   ← fine offset underline, tonal ink
       │
       ▼ (hover 800 ms · focus · tap)
  ┌─────────────────────────────────────────────┐
  │ John 14:27  BSB                              │
  │ ²⁷ Peace I leave with you; My peace I give   │
  │ to you. I do not give to you as the world    │
  │ gives. Do not let your hearts be troubled;   │
  │ do not be afraid.                            │
  │                                              │
  │ Open in Sources     Read chapter 14          │  ← text actions, ≥44px rows
  └─────────────────────────────────────────────┘
```

Mobile (375 px), the same reference opens a bottom sheet:

```
┌───────────────────────────────┐
│ …not the world's John 14:27.  │
│                               │
│                               │
├───────────────────────────────┤  ← sheet, drag handle on top edge
│  John 14:27 · BSB             │
│  ²⁷ Peace I leave with you;   │
│  My peace I give to you. I do │
│  not give to you as the world │
│  gives. Do not let your…      │
│                               │
│  Read chapter 14        Close │
└───────────────────────────────┘
```

Scripture block (a verse link alone on its line):

```
  Jesus spoke this the night before the cross:

      ²⁷ Peace I leave with you; My peace I give to you.
      I do not give to you as the world gives. Do not let
      your hearts be troubled; do not be afraid.
                                         John 14:27 · BSB

  The peace He means is…
```

Passage card for a range (`verse:1CO.13.4-7`):

```
  ┌──────────────────────────────────────────────────────┐
  │ 1 Corinthians 13:4–7 · BSB                            │
  │ ⁴ Love is patient, love is kind. It does not envy,    │
  │ it does not boast, it is not proud. ⁵ It is not rude, │
  │ it is not self-seeking, it is not easily angered…     │
  │                                                       │
  │ Show all 4 verses                                     │
  └──────────────────────────────────────────────────────┘
```

Long answer with a numbered verse list:

```
  Paul links suffering and hope in several places¹ ², and
  Peter writes about joy in trials³…

  Verses
  1  Romans 5:3–4     We also rejoice in our sufferings, because…
  2  Romans 8:18      I consider that our present sufferings are…
  3  1 Peter 1:6      In this you greatly rejoice, though now…
                                                     Open in Sources
```

Sources panel (desktop) with an unverified entry:

```
┌──────────────────── chat ────────────────────┬──── Sources ─────── ✕ ┐
│                                              │ John 14:27 · BSB        │
│  …                                           │ Peace I leave with you; │
│                                              │ My peace I give to you… │
│                                              │                         │
│                                              │ Matthew 5:9 · BSB       │
│                                              │ Blessed are the         │
│                                              │ peacemakers…            │
│                                              │                         │
│                                              │ Psalm 23:1              │
│                                              │ Not checked against the │
│                                              │ Bible text.             │
└──────────────────────────────────────────────┴─────────────────────────┘
```

Pending versus unverified (shown only after `done`):

```
  streaming:   …as He promised John 14:27 and…      (neutral ink, no underline style yet)
  after done:  …as He promised John 14:27 and…      (verified: tonal ink + offset underline)
               …see also Psalm 23:1                  (unverified: muted, dotted underline)
```

## 5. Flashcard kinds

### 5.1 Schema (replaces `flashcardDraftSchema`)

```ts
// src/lib/flashcards/types.ts (proposed)
const verseRefs = z
  .array(z.string().refine((id): boolean => isVerseId(id), "Expected a verse id like JHN.3.16"))
  .min(1).max(8)
  .describe("Supporting verses as BOOK.chapter.verse ids, e.g. JHN.11.35");

const shared = {
  refs: verseRefs,
  explanation: z.string().max(1200).optional().describe("Shown after answering, with the verses"),
  category: z.enum(CATEGORIES),
  tone: z.enum(TONES),
  difficulty: z.number().int().min(1).max(3).default(1),
};

export const basicCard = z.strictObject({
  kind: z.literal("basic"),
  question: z.string().min(8).max(240),
  answer: z.string().min(1).max(400),
  ...shared,
});

export const multipleChoiceCard = z.strictObject({
  kind: z.literal("multiple_choice"),
  question: z.string().min(8).max(240),
  options: z.array(z.string().min(1).max(120)).min(3).max(5)
    .describe("One correct answer and plausible distractors. No 'all/none of the above'"),
  correctIndex: z.number().int().min(0).max(4),
  ...shared,
});

export const trueFalseCard = z.strictObject({
  kind: z.literal("true_false"),
  statement: z.string().min(8).max(240).describe("Decidable from the cited verses alone"),
  isTrue: z.boolean(),
  ...shared,
  explanation: z.string().min(10).max(1200).describe("Required: why it is true or false"),
});

export const fillBlankCard = z.strictObject({
  kind: z.literal("fill_blank"),
  text: z.string().min(12).max(300)
    .describe("Sentence with 1-3 blanks in double braces: 'Jesus wept at the tomb of {{Lazarus}}.'"),
  accept: z.array(z.array(z.string().max(60)).max(5)).max(3).optional()
    .describe("Extra accepted spellings per blank, in blank order"),
  ...shared,
});

export const shortAnswerCard = z.strictObject({
  kind: z.literal("short_answer"),
  question: z.string().min(8).max(240),
  answer: z.string().min(1).max(120),
  accept: z.array(z.string().max(120)).max(8).optional().describe("Other accepted answers"),
  ...shared,
});

export const longAnswerCard = z.strictObject({
  kind: z.literal("long_answer"),
  prompt: z.string().min(8).max(300).describe("A reflection or explain-in-your-words prompt"),
  keyPoints: z.array(z.string().min(3).max(200)).min(1).max(5)
    .describe("What a good answer touches on; not a single 'correct' answer"),
  ...shared,
});

export const flashcardDraftSchema = z.discriminatedUnion("kind", [
  basicCard, multipleChoiceCard, trueFalseCard, fillBlankCard, shortAnswerCard, longAnswerCard,
]);
export type FlashcardDraft = z.infer<typeof flashcardDraftSchema>;
export type FlashcardKind = FlashcardDraft["kind"];

/** The propose_flashcard tool input: root must be an object, so the union is wrapped. */
export const proposeFlashcardInput = z.strictObject({ card: flashcardDraftSchema });
```

### 5.2 Rules outside the schema

```ts
// Kept out of the JSON schema the model sees (smaller, strict-mode friendly), enforced in code.
export function validateDraft(card: FlashcardDraft): string | null {
  switch (card.kind) {
    case "multiple_choice": {
      if (card.correctIndex >= card.options.length) return "correctIndex is outside options";
      const norm = card.options.map((o) => o.trim().toLowerCase());
      if (new Set(norm).size !== norm.length) return "options must be distinct";
      if (norm.some((o) => /\b(all|none) of the above\b/.test(o))) return "no all/none of the above";
      return null;
    }
    case "fill_blank": {
      const blanks = card.text.match(/\{\{[^{}]+\}\}/g) ?? [];
      if (blanks.length < 1 || blanks.length > 3) return "use 1-3 {{blanks}}";
      if (card.accept && card.accept.length !== blanks.length) return "accept must align with blanks";
      return null;
    }
    default:
      return null;
  }
}
```

### 5.3 Storage

- Add `kind` (an enum) and `body jsonb` (the kind-specific fields) to `flashcards`. Keep `question` and `answer` filled for **every** kind, because they feed full-text search and list views:

| kind | `question` column | `answer` column |
|---|---|---|
| basic | question | answer |
| multiple_choice | question | the correct option |
| true_false | statement | "True" / "False" |
| fill_blank | text with blanks as "___" | blank answers, joined |
| short_answer | question | answer |
| long_answer | prompt | key points, joined |

- Migration: existing rows become `kind = 'basic'` with `body = '{}'`. The seed JSON gains `"kind": "basic"`.
- `FlashcardSummary` (for search hits in chat) adds `kind`, so the chat can show a mini card with the right layout.

### 5.4 Grading in study mode

| kind | How it's checked | Feedback |
|---|---|---|
| basic | Self-check: flip, then "Got it" / "Missed it" | Answer, explanation, verses |
| multiple_choice | Exact; option order shuffled per showing | The correct option is marked with text plus an icon (never colour alone), then the explanation |
| true_false | Exact | Always shows the explanation, since a guess is 50/50 |
| fill_blank | Per blank, after case, punctuation and space normalisation, against the answer plus `accept` | Wrong blanks show the expected word |
| short_answer | Normalised match against answer plus `accept`; "I was right" override | Expected answer shown |
| long_answer | No auto-grade. Self-check against key points; optional "Ask sholam to review" opens chat with the prompt and the user's answer | Key points with checkboxes |

## 6. Wireframes: question cards

The card is the signature object of the Flashcards mode (§7). Each kind has three states. **Proposal** sits inside a chat answer, **Edit** opens inline in place of the proposal, and **Study** fills the study screen. Every control is at least 44 px tall. Inline cards carry at most two actions plus a close control (✕, which dismisses the proposal; the small cards below omit it for width). The primary action is the only filled button, and the second is a text button, never an outlined twin.

### 6.1 Proposal state (in chat), shown for multiple choice

```
  ┌─ Suggested card · Multiple choice ──────────────────── ✕ ─┐
  │ Which disciple was sitting at a tax booth when Jesus        │
  │ called him?                                                 │
  │                                                             │
  │   ○ Peter      ● Matthew      ○ Thomas      ○ Andrew        │  ← ● marks the correct one
  │                                                             │
  │ Matthew 9:9                                                 │
  │                                                             │
  │ [ Add to deck ]   Edit                                      │
  └─────────────────────────────────────────────────────────────┘
```

While it streams (`tool_input_delta`), the same frame fills in field by field: the question first, then the options. **Add to deck** stays disabled with the label "Checking verses…" until `tool_output` arrives.

### 6.2 Proposal state, other kinds (compact)

```
 Basic                          True / false                    Fill in the blank
 ┌────────────────────────┐    ┌──────────────────────────┐    ┌──────────────────────────┐
 │ Suggested card · Basic │    │ Suggested card · True or │    │ Suggested card · Fill in │
 │ What did Zacchaeus     │    │ false                    │    │ the blank                │
 │ climb to see Jesus?    │    │ Jonah spent three days   │    │ Jesus wept at the tomb   │
 │ ─ answer ─             │    │ and nights in the fish.  │    │ of [Lazarus].            │
 │ A sycamore tree.       │    │ Answer: True             │    │                          │
 │ Luke 19:4              │    │ Jonah 1:17               │    │ John 11:35, 11:43        │
 │ [Add to deck]   Edit   │    │ [Add to deck]   Edit     │    │ [Add to deck]   Edit     │
 └────────────────────────┘    └──────────────────────────┘    └──────────────────────────┘

 Short answer                         Reflection (long answer)
 ┌───────────────────────────────┐   ┌────────────────────────────────────────┐
 │ Suggested card · Short answer │   │ Suggested card · Reflection            │
 │ How old was Methuselah when   │   │ In your own words, what kind of peace   │
 │ he died?                      │   │ does Jesus offer in John 14:27?         │
 │ Answer: 969 years             │   │ Key points: a gift, not earned · unlike │
 │ Also accepted: 969            │   │ the world's peace · frees from fear     │
 │ Genesis 5:27                  │   │ John 14:27                              │
 │ [Add to deck]   Edit          │   │ [Add to deck]   Edit                    │
 └───────────────────────────────┘   └────────────────────────────────────────┘
```

### 6.3 Edit state (inline form; one layout per kind)

```
 Multiple choice                                   Fill in the blank
 ┌────────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ Question                                    │   │ Sentence                              │
 │ [Which disciple was sitting at a tax… ]     │   │ [Jesus wept at the tomb of {{Lazarus}}│
 │ Options              Correct                │   │  .                                  ] │
 │ [Peter                        ]   ○         │   │ Preview: Jesus wept at the tomb of    │
 │ [Matthew                      ]   ●         │   │          ______.                      │
 │ [Thomas                       ]   ○         │   │ Also accept for blank 1               │
 │ [Andrew                       ]   ○         │   │ [Lazarus of Bethany              ] +  │
 │ + Add option (max 5)                         │   │ Verses                                │
 │ Verses                                       │   │ [John 11:35 ×] [+ Add verse]          │
 │ [Matthew 9:9 ×] [+ Add verse]                │   │ Category [People ▾]  Tone [Fact ▾]   │
 │ Category [People ▾]  Tone [Fact ▾]          │   │                                       │
 │ [ Save to deck ]   Cancel                    │   │ [ Save to deck ]   Cancel             │
 └────────────────────────────────────────────┘   └──────────────────────────────────────┘

 True / false                                     Short answer
 ┌────────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ Statement                                   │   │ Question                              │
 │ [Jonah spent three days and three nights  ] │   │ [How old was Methuselah when he died?]│
 │ Answer   (●) True   ( ) False               │   │ Answer                                │
 │ Why (shown after answering)                 │   │ [969 years                          ] │
 │ [The LORD appointed a great fish… 1:17    ] │   │ Also accept                           │
 │ Verses  [Jonah 1:17 ×] [+ Add verse]        │   │ [969 ×] [nine hundred sixty-nine ×] + │
 │ [ Save to deck ]   Cancel                   │   │ Verses  [Genesis 5:27 ×] [+ Add verse]│
 └────────────────────────────────────────────┘   │ [ Save to deck ]   Cancel             │
                                                   └──────────────────────────────────────┘
 Reflection (long answer)                         Basic
 ┌────────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ Prompt                                      │   │ Question                              │
 │ [In your own words, what kind of peace…   ] │   │ [What did Zacchaeus climb to see…   ] │
 │ Key points (1–5)                            │   │ Answer                                │
 │ 1 [a gift, not earned                     ] │   │ [A sycamore tree.                   ] │
 │ 2 [unlike the world's peace               ] │   │ Explanation (optional)                │
 │ 3 [frees from fear                        ] │   │ [                                   ] │
 │ + Add key point                             │   │ Verses  [Luke 19:4 ×] [+ Add verse]   │
 │ Verses  [John 14:27 ×] [+ Add verse]        │   │ [ Save to deck ]   Cancel             │
 │ [ Save to deck ]   Cancel                   │   └──────────────────────────────────────┘
 └────────────────────────────────────────────┘
```

Every edit form shares the lower block: Verses, Category and Tone (shown in the multiple-choice form), then the action row.

Verses are added by human reference ("John 11:35"), parsed with `parseReference` and checked against `verses` before Save is enabled. Labels sit above fields, errors appear under the field with an icon and text, and validation runs on blur.

### 6.4 Study state, desktop

```
 Multiple choice (after answering)               True / false
 ┌──────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ 3 of 12                          People   │   │ 4 of 12                       Numbers │
 │                                           │   │                                       │
 │ Which disciple was sitting at a tax       │   │ Jonah spent three days and three      │
 │ booth when Jesus called him?              │   │ nights in the belly of the fish.      │
 │                                           │   │                                       │
 │  ( ) Peter                                │   │      [  True  ]      [  False  ]       │
 │  (✓) Matthew        Correct               │   │                                       │
 │  ( ) Thomas                               │   │                                       │
 │  ( ) Andrew                               │   │                                       │
 │                                           │   │                                       │
 │ ⁹ As Jesus went on from there, He saw a   │   │                                       │
 │ man named Matthew sitting at the tax      │   │                                       │
 │ booth…                       Matthew 9:9  │   │                                       │
 │                                           │   │                                       │
 │ Back                                Next  │   │ Back                           Skip   │
 └──────────────────────────────────────────┘   └──────────────────────────────────────┘

 Fill in the blank                               Short answer
 ┌──────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ Jesus wept at the tomb of [__________].   │   │ How old was Methuselah when he died?  │
 │                                           │   │ [ 969                            ]   │
 │                           [ Check ]       │   │                          [ Check ]    │
 │ after: ✗ "Lazurus" → Lazarus              │   │ after: ✓ 969 years · Genesis 5:27     │
 │        Close enough? I was right          │   │        I was right (override)          │
 └──────────────────────────────────────────┘   └──────────────────────────────────────┘

 Reflection (long answer)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ In your own words, what kind of peace does Jesus offer in John 14:27?     │
 │ ┌──────────────────────────────────────────────────────────────────────┐ │
 │ │                                                                      │ │
 │ │                                                                      │ │
 │ └──────────────────────────────────────────────────────────────────────┘ │
 │ [ Show key points ]                       Ask sholam to review my answer │
 │ after: ☐ a gift, not earned   ☐ unlike the world's peace   ☐ frees fear  │
 └──────────────────────────────────────────────────────────────────────────┘

 Basic (flip), before and after
 ┌──────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ 7 of 12                           People  │   │ 7 of 12                       People │
 │                                           │   │ What did Zacchaeus climb to see       │
 │ What did Zacchaeus climb to see Jesus     │   │ Jesus over the crowd?                 │
 │ over the crowd?                           │   │                                       │
 │                                           │   │ A sycamore tree.                      │
 │                                           │   │ ⁴ So he ran on ahead and climbed a    │
 │                                           │   │ sycamore tree to see Him…  Luke 19:4  │
 │                                           │   │                                       │
 │            [ Show answer ]                │   │ [ Got it ]              Missed it     │
 └──────────────────────────────────────────┘   └──────────────────────────────────────┘
```

### 6.5 Mobile (375 px): study and proposal

```
┌───────────────────────────────┐
│ 3 of 12                  ✕    │
│                               │
│ Which disciple was sitting at │
│ a tax booth when Jesus called │
│ him?                          │
│                               │
│ ┌───────────────────────────┐ │  ← full-width options, 52px tall
│ │ Peter                     │ │
│ ├───────────────────────────┤ │
│ │ ✓ Matthew   Correct       │ │
│ ├───────────────────────────┤ │
│ │ Thomas                    │ │
│ ├───────────────────────────┤ │
│ │ Andrew                    │ │
│ └───────────────────────────┘ │
│ Matthew 9:9 ▸ (bottom sheet)  │
│                               │
│ Back                    Next  │  ← thumb zone
└───────────────────────────────┘
```

Proposal card in a mobile chat: full bleed within the message column, options stacked, actions in one row:

```
┌───────────────────────────────┐
│ …here's a card you could keep:│
│ ┌───────────────────────────┐ │
│ │ Suggested card ·        ✕ │ │
│ │ Multiple choice           │ │
│ │ Which disciple was at a   │ │
│ │ tax booth when called?    │ │
│ │ ○ Peter                   │ │
│ │ ● Matthew                 │ │
│ │ ○ Thomas                  │ │
│ │ ○ Andrew                  │ │
│ │ Matthew 9:9               │ │
│ │ [ Add to deck ]     Edit  │ │
│ └───────────────────────────┘ │
│ [ Ask anything            ↑ ] │
└───────────────────────────────┘
```

On mobile, Edit opens the form as a full-height sheet rather than inline, because a 5-field form inside a chat bubble scrolls badly.

### 6.6 Wireframes: `ask_user`

```
 single_choice (in chat, after the agent's text)       multi_choice
 ┌──────────────────────────────────────────────┐     ┌──────────────────────────────────┐
 │ What kind of card should I make?              │     │ Which topics should the quiz     │
 │  ( ) Basic flip                               │     │ cover? Pick any.                 │
 │  (●) Multiple choice                          │     │  [✓] Miracles   [ ] Parables     │
 │  ( ) True or false                            │     │  [✓] Prophets   [ ] Kings        │
 │  ( ) Fill in the blank                        │     │  [ ] Something else: [       ]   │
 │  ( ) Something else: [                    ]   │     │                                  │
 │ [ Send ]   Skip                               │     │ [ Send ]   Skip                  │
 └──────────────────────────────────────────────┘     └──────────────────────────────────┘

 short_text                                            long_text
 ┌──────────────────────────────────────────────┐     ┌──────────────────────────────────┐
 │ Which verse did you have in mind?             │     │ What happened that you'd like to │
 │ [ e.g. Philippians 4:6                     ]  │     │ pray about? (optional)           │
 │ [ Send ]   Skip                               │     │ ┌──────────────────────────────┐ │
 └──────────────────────────────────────────────┘     │ │                              │ │
                                                       │ └──────────────────────────────┘ │
 confirm                                               │ [ Send ]   Skip                  │
 ┌──────────────────────────────────────────────┐     └──────────────────────────────────┘
 │ Make this a flashcard?                        │
 │ [ Yes, draft it ]   No thanks                 │     answered (collapsed in history)
 └──────────────────────────────────────────────┘     │ What kind of card…  → Multiple choice │
```

While a question is open, the composer stays usable. Sending a message instead closes the question as "skipped" (§3.5). Keyboard: the radio group follows the APG pattern, Enter sends, Esc skips.

## 7. Design checks (deslop-law and hallmark)

These were applied to the wireframes above, and they also bind the build:

- **References are typeset text, not tinted pills.** Pill chips around every bit of metadata are a component-kit tell; the reference is set in the body face with a tonal shift. *(The current `VerseChip` uses a muted pill; change it in Phase 2.)*
- **No decorative quote marks.** The scripture block gets its weight from type, verse superscripts and spacing.
- **One clear action per card, two at most.** "Add to deck" is the only filled button, "Edit" is a text button, and dismissing is a ✕ with a 44 px hit area and an accessible label "Dismiss suggestion". No filled-plus-outlined pair; this matches the two-action limit for inline cards (§2.6).
- **Labels vary by role.** "Suggested card · Multiple choice" uses sentence case, with no tracked caps on every small label.
- **Every interactive element has all 8 states:** default, hover (only under `@media (hover: hover)`), focus-visible, active, disabled (with the reason, such as "Checking verses…"), loading, error and success. Focus rings appear instantly. Hit targets are at least 44 px.
- **Nothing depends on hover.** Popovers open on focus and tap, and become bottom sheets on touch.
- **Colour is never the only signal.** Correct and incorrect get ✓ or ✗ plus text, and unverified gets words, not just a muted colour.
- **Content is visible by default.** Streamed cards draw in place as a skeleton that fills; nothing waits on an entrance animation.
- **Silent success.** Saving a card swaps the action row to "Saved to the deck · Undo"; no celebratory toast.
- **Mobile is checked at 320, 375, 414 and 768 px.** No horizontal scroll, no two-line buttons, and the study controls sit in the thumb zone.
- **UI copy uses no em dashes.** Headings stay roman (no italic emphasis words), and the copy is short.
- **Signature, to be decided in the Phase 3 design pass.** Two candidates fit what sholam is: (a) scripture set like a printed Bible page (verse superscripts, a dedicated scripture face, a hanging reference), and (b) the flashcard as an index card with one bespoke detail (a single top rule or a notched corner), used consistently in chat proposals and the deck. Pick one. The scripture face should be a deliberate, likely self-hosted choice, not a default Google serif.

## 8. Phased plan

**Phase 2 (chat)**
1. Event lifecycle (§3.3–3.4), the client tool-part map, and persisted `messages.ui`.
2. The citation spike (§4.1), then the chosen mechanism, the quote check, and the `done.citations` report.
3. Citation formats: inline reference with popover and bottom sheet, scripture block, passage card, Sources panel and sheet, pending and unverified states. Range ids.
4. `ask_user` with single choice, multiple choice, short text and confirm, plus pause and resume.
5. `propose_flashcard` with the union schema, enabled for **basic, multiple_choice and true_false**. Proposal card, inline edit, the `card_proposals` table, and outcome notes on the next turn.
6. The `flashcards.kind` and `body` migration.

**Phase 3 (flashcards)**
1. Enable the fill_blank, short_answer and long_answer kinds, plus the `long_text` question kind.
2. Study mode per kind with grading (§5.4), and "Ask sholam to review" for reflections.
3. The full card editor in the Flashcards tab (the same components as the inline edit).
4. Numbered verse lists for long answers; verse popovers on card backs (`GET /api/verses`).
5. The design pass: pick the signature (§7), the scripture face, the 8-state audit, and the mobile checks.

**Phase 4 (enrichment):** Compare (BSB and WEB), Related verses (cross-references), and red-letter words of Jesus (needs the importer to keep `wj` spans).

## 9. Risks

| Risk | Mitigation |
|---|---|
| The model fills the nested union badly (wrong fields for a kind) | Clear `describe()` text, zod errors returned as fixable `is_error` results, eval cases per kind. Fallback: one tool per kind (`propose_mcq_card`, …) |
| `strict: true` rejects bounded schemas | Don't use strict for now; zod validates every input |
| Native citations change answer style or lower coverage | The spike measures it before adopting; markdown links remain the fallback |
| True/false teaches little (50/50 guessing) | Explanation required and always shown; keep true/false a minority of the deck |
| Distractors or statements carry doctrinal bias | Prompt rules (§3.7), refs required, public cards can be reported, and a review queue if the user wants one |
| `ask_user` gets overused | One per turn, only when the answer changes the output; measure how often it fires |
| Streaming partial input flickers or shows invalid drafts | Throttle to ~100 ms, use a tolerant parser, keep the draft non-actionable until validated |
| Reopened chats lose UI state | `messages.ui` plus `card_proposals` rebuild every component |
| Popovers misbehave on touch or narrow screens | Bottom sheets below 768 px; the Popover API with anchor positioning, flipping at edges |

## 10. Open questions for you

1. **Card kinds at launch.** Basic, multiple choice and true/false in Phase 2, and the rest in Phase 3? Or keep true/false out entirely, as Quizlet did in one mode?
2. **Reflection cards.** Self-check against key points only, or also offer "Ask sholam to review my answer", which costs a model call each time?
3. **Native citations.** OK to run the half-day spike, and adopt them if they match the markdown links?
4. **Default citation look.** Inline references (recommended), or numbered markers everywhere?
5. **Red-letter words of Jesus.** Wanted? If yes, the BSB importer should keep `wj` spans now, which is cheaper than re-importing later.
6. **User card review.** Should user-made cards of every kind publish immediately, or wait for review (this connects to the open question in PLAN.md)?

## 11. Summary

- Keep sholam's own loop and a fixed set of components: every tool has a typed UI payload, one lifecycle on the wire, and persisted UI events. Don't let the model author UI.
- For verses, try Claude's native `search_result` citations, which can only cite what our tools returned. Use the `verse:` link as a display directive, and add a quote check.
- Show citations as typeset references with popovers and bottom sheets, scripture blocks, passage cards, a verse list for long answers, and the Sources panel, with honest pending and unverified states.
- Add `ask_user` (a small closed set of question kinds) that pauses the loop and returns its answer as a `tool_result`. Typing instead closes it as skipped.
- Turn flashcards into a discriminated union of six kinds with proposal, edit and study layouts. Proposals are drafts whose outcomes live outside the transcript. Ship three kinds in Phase 2 and three in Phase 3.
