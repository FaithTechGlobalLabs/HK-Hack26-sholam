import ShalomCore
import SwiftUI
import UIKit

/// Native answer rendering. A verse is never promoted from a cached lookup or
/// another turn; only this message's final server check supplies its status.
/// Plain-text mentions are listed as sources but are never shown as checked.
struct AnswerView: View {
    let message: ChatMessage
    let onCard: (String) -> Void
    @State private var selectedPassage: CitedPassage?
    @State private var copied = false
    @State private var showSources = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Readable measure for sustained prose on regular width. The chat column
    /// itself (composer, user bubble) keeps its own width.
    private static let readableAnswerWidth: CGFloat = 640

    private var sources: [CitedPassage] { CitationResolver.sources(in: message) }

    var body: some View {
        let sources = sources
        VStack(alignment: .leading, spacing: 14) {
            // The answer itself: unboxed prose, like ChatGPT.
            if !message.text.isEmpty {
                NativeMarkdown(
                    text: message.text,
                    incompleteTail: message.delivery != .complete
                )
                .textSelection(.enabled)
                .environment(\.openURL, OpenURLAction { openReference($0, sources: sources) })
            }

            if let status = progressStatus(sources: sources) {
                HStack(spacing: 8) {
                    if status.spinner {
                        ProgressView().controlSize(.small).tint(ShalomTheme.mutedInk)
                    }
                    Text(status.text).font(.footnote)
                }
                .foregroundStyle(ShalomTheme.mutedInk)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("answer-progress")
            }

            if message.delivery != .streaming && !message.text.isEmpty {
                actionRow(sources: sources)
                if showSources && !sources.isEmpty {
                    sourceList(sources)
                }
            }

            if !message.quoteWarnings.isEmpty {
                Label("Quoted words for \(message.quoteWarnings.joined(separator: ", ")) were not checked against the Bible text.",
                      systemImage: "questionmark.circle")
                    .font(.footnote)
            }

            if !message.cards.isEmpty && message.delivery != .streaming {
                VStack(alignment: .leading, spacing: 0) {
                    Label("Related flashcards", systemImage: "square.stack")
                        .font(.subheadline.weight(.semibold))
                        .padding(.bottom, 4)
                    ForEach(message.cards) { card in
                        Button { onCard(card.id) } label: {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(card.question).multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.caption)
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(ShalomTheme.skyInk)
                    }
                }
            }

            if let draft = message.proposal {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Suggested flashcard").font(.subheadline.weight(.semibold))
                        .foregroundStyle(ShalomTheme.mutedInk)
                    Text(draft.question).font(.body.weight(.semibold))
                    Text(draft.answer)
                    if let explanation = draft.explanation { Text(explanation) }
                    Text(draft.refs.map { ReferenceFormatter.label(for: $0) }.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(ShalomTheme.mutedInk)
                    Text("Draft only. Saving new cards is not available yet.")
                        .font(.footnote.weight(.medium))
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background { ChatSurface(cornerRadius: 18) }
            }
            if let error = message.error {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.subheadline)
                    .accessibilityIdentifier("answer-error")
            }
        }
        .foregroundStyle(ShalomTheme.ink)
        .frame(maxWidth: Self.readableAnswerWidth, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(item: $selectedPassage) { passage in
            PassageSheet(passage: passage)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: Status

    /// One quiet line while streaming: the current lookup replaces "Thinking",
    /// and nothing shows once the answer settles.
    private func progressStatus(sources: [CitedPassage]) -> (text: String, spinner: Bool)? {
        guard message.delivery == .streaming else { return nil }
        if let active = message.tools.last(where: { !$0.done }) {
            return (toolLabel(active.name), true)
        }
        if message.text.isEmpty {
            return ("Thinking about your question…", true)
        }
        if !sources.isEmpty && !message.hasFinalCitationCheck {
            return ("Bible references are checked before the answer finishes.", false)
        }
        return nil
    }

    // MARK: Actions and sources

    /// One quiet action section: a row normally, a leading column at
    /// accessibility text sizes so the controls wrap instead of truncating.
    private func actionRow(sources: [CitedPassage]) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0))
            : AnyLayout(HStackLayout(spacing: 20))
        return layout {
            Button {
                UIPasteboard.general.string = message.text
                copied = true
                Task { try? await Task.sleep(for: .seconds(1.5)); copied = false }
            } label: {
                Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                    .labelStyle(.titleAndIcon)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("answer-copy")

            if !sources.isEmpty {
                Button { showSources.toggle() } label: {
                    HStack(spacing: 6) {
                        Text("Sources")
                        Text("\(sources.count)").monospacedDigit()
                            .foregroundStyle(ShalomTheme.mutedInk)
                        Image(systemName: showSources ? "chevron.up" : "chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ShalomTheme.mutedInk)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("Sources")
                .accessibilityValue(sourcesValue(sources))
                .accessibilityHint(showSources ? "Hides the Bible references" : "Shows the Bible references")
                .accessibilityIdentifier("answer-sources")
            }

            if message.delivery == .stopped || message.delivery == .incomplete {
                Text(message.delivery == .stopped ? "Stopped" : "Incomplete answer")
                    .font(.caption)
                    .foregroundStyle(ShalomTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("answer-delivery-status")
            }
        }
        .buttonStyle(.plain).font(.subheadline)
        .padding(.top, -6)
    }

    private func sourcesValue(_ sources: [CitedPassage]) -> String {
        let checked = sources.filter(\.isVerified).count
        let total = sources.count == 1 ? "1 reference" : "\(sources.count) references"
        return "\(total), \(checked) looked up before answering, \(showSources ? "shown" : "hidden")"
    }

    private func sourceList(_ sources: [CitedPassage]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if sources.contains(where: \.isVerified) {
                Text("Berean Standard Bible. Checked references were looked up before answering.")
                    .font(.caption)
                    .foregroundStyle(ShalomTheme.mutedInk)
                    .padding(.bottom, 4)
            }
            ForEach(sources) { passage in
                Button { selectedPassage = passage } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: passage.isVerified ? "book" : "questionmark.circle")
                            .foregroundStyle(passage.isVerified ? ShalomTheme.skyInk : ShalomTheme.mutedInk)
                            .accessibilityHidden(true)
                        Text(passage.label).multilineTextAlignment(.leading)
                        Spacer(minLength: 8)
                        if !passage.isVerified {
                            Text("Not checked").font(.footnote)
                                .foregroundStyle(ShalomTheme.mutedInk)
                        }
                        Image(systemName: "chevron.right").font(.caption)
                            .foregroundStyle(ShalomTheme.mutedInk)
                            .accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .font(.subheadline)
                .accessibilityLabel(passage.label + Self.statusSuffix(for: passage))
                .accessibilityHint("Opens the Bible passage")
                .accessibilityIdentifier("verse-reference-\(passage.id)")
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Spoken state for a source. Mentions are never verified.
    static func statusSuffix(for passage: CitedPassage) -> String {
        if case .mention = passage.kind { return ", plain-text reference, not checked" }
        return passage.isVerified ? ", looked up before answering" : ", not checked"
    }

    private func openReference(_ url: URL, sources: [CitedPassage]) -> OpenURLAction.Result {
        if url.scheme?.lowercased() == "verse" {
            let id = String(url.absoluteString.dropFirst("verse:".count))
            selectedPassage = sources.first { passage in
                if case .link = passage.kind { return passage.id == id }
                return false
            } ?? CitationResolver.passage(
                firstID: id, label: ReferenceFormatter.label(for: id), message: message
            )
            return .handled
        }
        if url.path == "/flashcards", let id = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "card" })?.value {
            onCard(id)
            return .handled
        }
        guard ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { return .discarded }
        return .systemAction
    }

    private func toolLabel(_ name: String) -> String {
        switch name {
        case "lookup_verses": "Looking up verses…"
        case "search_bible": "Searching the Bible…"
        case "search_flashcards": "Searching flashcards…"
        case "propose_flashcard": "Drafting a flashcard…"
        default: "Working on your question…"
        }
    }
}

/// The full fetched range for one reference. Shows only verse text a tool
/// returned in this turn; it never fetches and never fills in from memory.
struct PassageSheet: View {
    let passage: CitedPassage
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if passage.isVerified {
                        Text("Berean Standard Bible").font(.subheadline).foregroundStyle(ShalomTheme.mutedInk)
                        numberedVerses(passage.verses)
                        Label("Looked up before answering", systemImage: "checkmark")
                            .font(.footnote).foregroundStyle(ShalomTheme.mutedInk)
                    } else {
                        Label("Not checked", systemImage: "questionmark.circle").font(.headline)
                            .accessibilityIdentifier("passage-not-checked")
                        Text(uncheckedReason)
                    }
                }
                .textSelection(.enabled).padding(24)
                .frame(maxWidth: 640, alignment: .leading)
            }
            .accessibilityIdentifier("passage-sheet")
            .foregroundStyle(ShalomTheme.ink)
            .background(ShalomTheme.factPaper)
            .navigationTitle(passage.label).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.accessibilityIdentifier("passage-sheet-done")
                }
            }
        }
        .tint(ShalomTheme.accent)
        .preferredColorScheme(.light)
    }

    /// A server issue (quote mismatch, not fetched) wins; otherwise the
    /// resolver's own explanation, which says plainly when a reference was a
    /// plain-text mention that nothing checked.
    private var uncheckedReason: String {
        if case .issue(let reason) = passage.status { return reason.explanation }
        if let explanation = passage.uncheckedExplanation { return explanation }
        if let issue = passage.issue { return issue.explanation }
        if case .pending = passage.status {
            return "Bible references are checked before the answer finishes."
        }
        return "This reference was not checked against the Bible text."
    }
}

@ViewBuilder
private func numberedVerses(_ verses: [VerseRecord], numberColor: Color = ShalomTheme.accent) -> some View {
    VStack(alignment: .leading, spacing: 10) {
        ForEach(verses) { verse in
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(verse.id.split(separator: ".").last.map(String.init) ?? "")
                    .font(.caption.weight(.semibold)).foregroundStyle(numberColor)
                    .accessibilityLabel("Verse \(verse.id.split(separator: ".").last.map(String.init) ?? "")")
                Text(verse.text).font(.body).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("verse-text-\(verse.id)")
            }
        }
    }
}

/// Block structure comes from the shared `MarkdownBlockParser` (lists keep
/// their markers, unfinished streaming syntax is sanitised); inline links,
/// emphasis and code use the system Markdown parser.
private struct NativeMarkdown: View {
    let text: String
    let incompleteTail: Bool

    @ScaledMetric(relativeTo: .body) private var paragraphGap: CGFloat = 12
    @ScaledMetric(relativeTo: .body) private var itemGap: CGFloat = 5
    @ScaledMetric(relativeTo: .body) private var indentStep: CGFloat = 20
    @ScaledMetric(relativeTo: .body) private var markerWidth: CGFloat = 22

    var body: some View {
        let blocks = MarkdownBlockParser.blocks(text, incompleteTail: incompleteTail)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.element.id) { index, block in
                view(for: block)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, index == 0 ? 0 : gap(before: block, after: blocks[index - 1]))
            }
        }
        .font(.body).lineSpacing(4)
    }

    private func gap(before block: MarkdownBlock, after previous: MarkdownBlock) -> CGFloat {
        Self.isListItem(block) && Self.isListItem(previous) ? itemGap : paragraphGap
    }

    private static func isListItem(_ block: MarkdownBlock) -> Bool {
        switch block.kind {
        case .bullet, .ordered: true
        default: false
        }
    }

    @ViewBuilder
    private func view(for block: MarkdownBlock) -> some View {
        switch block.kind {
        case .paragraph:
            inline(block.text)
        case .heading(let level):
            inline(block.text)
                .font(level <= 1 ? .title3.weight(.semibold) : level == 2 ? .headline : .subheadline.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
        case .bullet(let depth):
            listItem(marker: Self.bulletGlyph(depth), depth: depth, text: block.text)
        case .ordered(let number, let depth):
            listItem(marker: "\(number).", depth: depth, text: block.text)
                .accessibilityIdentifier("markdown-ordered-item-\(number)")
        case .quote:
            HStack(alignment: .top, spacing: 12) {
                Rectangle().fill(ShalomTheme.ink.opacity(0.3)).frame(width: 3)
                    .accessibilityHidden(true)
                inline(block.text).italic()
                    .fixedSize(horizontal: false, vertical: true)
            }
            .fixedSize(horizontal: false, vertical: true)
        case .code:
            ScrollView(.horizontal) {
                Text(verbatim: block.text)
                    .font(.system(.footnote, design: .monospaced))
                    .lineSpacing(2)
                    .padding(12)
            }
            .background(.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
        case .rule:
            Rectangle().fill(ShalomTheme.ink.opacity(0.15)).frame(height: 1)
                .padding(.vertical, 4)
                .accessibilityHidden(true)
        }
    }

    private func listItem(marker: String, depth: Int, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(verbatim: marker)
                .monospacedDigit()
                .frame(minWidth: markerWidth, alignment: .trailing)
                // Ordered numbers are read aloud; bullet glyphs are not.
                .accessibilityHidden(!marker.hasSuffix("."))
            inline(text).fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, CGFloat(max(depth, 0)) * indentStep)
        .accessibilityElement(children: .combine)
    }

    private static func bulletGlyph(_ depth: Int) -> String {
        switch max(depth, 0) % 3 {
        case 0: "•"
        case 1: "◦"
        default: "▪︎"
        }
    }

    private func inline(_ source: String) -> Text {
        guard var value = try? AttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) else { return Text(verbatim: source) }
        // Verse links read as plain ink with an underline: no background that
        // could be mistaken for a text selection.
        for run in value.runs where run.link?.scheme == "verse" {
            value[run.range].foregroundColor = ShalomTheme.ink
            value[run.range].underlineStyle = Text.LineStyle.single
        }
        return Text(value)
    }
}
