import Foundation

/// One `[Label](verse:BOOK.c.v)` link in an answer.
public struct InlineCitation: Equatable, Sendable {
    public let label: String
    public let verseID: String
    public init(label: String, verseID: String) {
        self.label = label; self.verseID = verseID
    }
}

/// How a source was written in the answer.
public enum CitationKind: String, Sendable {
    /// A `verse:` link, covered by the server's final citation check.
    case link
    /// A plain-text reference ("Romans 8:28"); the server check does not cover it.
    case mention
}

/// Presentation state of one source. Not a wire or cache type.
public enum CitationStatus: Equatable, Sendable {
    /// The message is still streaming.
    case pending
    /// Link + final check + no issue + complete fetched coverage + complete delivery + no error.
    case verified
    /// A server issue, or a local `.notFetched` for a settled link without text.
    case issue(CitationIssueReason)
    /// A settled link with fetched text that the final check did not fully
    /// cover (legacy, stopped, incomplete, failed, error, or partial range).
    case unchecked
    /// A plain-text mention; the server check does not cover it.
    case uncheckedFormat
}

/// The fetched verses behind one cited source, and how far they can be
/// trusted. `isVerified` is true only for a link after the server's final
/// citation check, with no issue, fetched text covering the whole labelled
/// passage, a complete delivery and no error.
public struct CitedPassage: Equatable, Identifiable, Sendable {
    /// The linked (first) verse id, e.g. `JHN.1.1`.
    public let id: String
    public let label: String
    /// Verses tools returned in this message's turn (never new lookups).
    /// Always empty for mentions.
    public let verses: [VerseRecord]
    /// The server's issue, or `.notFetched` when a settled answer has no
    /// fetched text for this citation.
    public let issue: CitationIssueReason?
    public let isVerified: Bool
    public let kind: CitationKind
    /// A plain mention whose quoted words the server named in `quoteWarnings`.
    public let quoteNotChecked: Bool
    public let status: CitationStatus
    /// Why this source is not shown as checked; nil when verified.
    public let uncheckedExplanation: String?

    public static let mentionExplanation =
        "This reference is written as plain text, not a checked link, so Shalom did not check it against the Bible text."
    public static let quoteNotCheckedExplanation = "The quoted words were not checked either."
    public static let genericExplanation = "This reference was not checked against the Bible text."
    public static let pendingExplanation = "Bible references are checked before the answer finishes."
    public static let partialExplanation =
        "Only part of this passage was looked up before answering, so the whole reference was not checked."
    public static let errorExplanation =
        "The answer ended with an error, so this reference was not checked against the Bible text."
    public static let unfinishedExplanation =
        "The answer did not finish, so this reference was not checked against the Bible text."

    /// Source-compatible with the original five-argument init. An issue
    /// always wins, a mention is never verified, and `isVerified` is kept
    /// consistent with the resolved status.
    public init(id: String, label: String, verses: [VerseRecord],
                issue: CitationIssueReason?, isVerified: Bool,
                kind: CitationKind = .link, quoteNotChecked: Bool = false,
                status: CitationStatus? = nil, uncheckedExplanation: String? = nil) {
        let resolved: CitationStatus
        if let issue {
            resolved = .issue(issue)
        } else if let status, status != .verified {
            resolved = status
        } else if kind == .mention {
            resolved = .uncheckedFormat
        } else {
            resolved = isVerified ? .verified : .unchecked
        }
        self.id = id; self.label = label; self.verses = verses
        self.issue = issue
        self.isVerified = resolved == .verified
        self.kind = kind
        self.quoteNotChecked = quoteNotChecked
        self.status = resolved
        self.uncheckedExplanation = resolved == .verified ? nil
            : uncheckedExplanation ?? Self.explanation(for: resolved, kind: kind, quoteNotChecked: quoteNotChecked)
    }

    static func explanation(for status: CitationStatus, kind: CitationKind, quoteNotChecked: Bool) -> String? {
        let base: String?
        switch status {
        case .verified: return nil
        case .issue(let reason): base = reason.explanation
        case .uncheckedFormat: base = mentionExplanation
        case .pending: base = kind == .mention ? mentionExplanation : pendingExplanation
        case .unchecked: base = kind == .mention ? mentionExplanation : genericExplanation
        }
        guard let base else { return nil }
        return quoteNotChecked ? base + " " + quoteNotCheckedExplanation : base
    }
}

/// Port of `citedVerses` (`src/lib/chat/cited-verses.ts`) and the passages
/// section in `MessageList.tsx`. Uses only the message's own evidence.
public enum CitationResolver {
    /// Longest run of verses shown for one citation.
    public static let maxVersesPerPassage = 40
    /// Bounds the work one label can cause (chapter ranges, comma lists).
    static let maxRangeSteps = 400
    static let maxReferencesPerLabel = 40
    static let maxCitationsPerMessage = 500

    /// Every distinct linked passage in order of first appearance (links only).
    public static func passages(in message: ChatMessage) -> [CitedPassage] {
        var seen = Set<String>()
        var out: [CitedPassage] = []
        for citation in citations(in: message.text) where seen.insert(citation.verseID).inserted {
            out.append(passage(firstID: citation.verseID, label: citation.label, message: message))
        }
        return out
    }

    /// Links and plain-text mentions, merged in order of first appearance and
    /// deduplicated on the first verse id. A link beats a mention of the same
    /// verse; among mentions the first wins. Fetched text and an empty issue
    /// list never promote a mention.
    public static func sources(in message: ChatMessage) -> [CitedPassage] {
        let links = locatedCitations(in: message.text)
        let mentions = ReferenceScanner.mentions(in: message.text, streaming: message.delivery == .streaming)
        var firstLink: [String: InlineCitation] = [:]
        for link in links where firstLink[link.citation.verseID] == nil {
            firstLink[link.citation.verseID] = link.citation
        }

        var seen = Set<String>()
        var out: [CitedPassage] = []
        func emit(_ id: String, mention: ReferenceMention?) {
            guard seen.insert(id).inserted else { return }
            if let link = firstLink[id] {
                out.append(passage(firstID: id, label: link.label, message: message))
            } else if let mention {
                out.append(mentionPassage(mention, message: message))
            }
        }
        var l = 0, m = 0
        while l < links.count || m < mentions.count {
            if m >= mentions.count || (l < links.count && links[l].offset <= mentions[m].range.lowerBound) {
                emit(links[l].citation.verseID, mention: nil)
                l += 1
            } else {
                emit(mentions[m].firstVerseID, mention: mentions[m])
                m += 1
            }
        }
        return out
    }

    static func mentionPassage(_ mention: ReferenceMention, message: ChatMessage) -> CitedPassage {
        let quoted = message.quoteWarnings.contains(mention.text)
            || message.quoteWarnings.contains(mention.primaryText)
        return CitedPassage(
            id: mention.firstVerseID, label: mention.label, verses: [],
            // A late server issue for this verse still wins.
            issue: message.unverified[mention.firstVerseID], isVerified: false,
            kind: .mention, quoteNotChecked: quoted,
            status: message.delivery == .streaming ? .pending : .uncheckedFormat
        )
    }

    public static func passage(firstID: String, label: String, message: ChatMessage) -> CitedPassage {
        var issue = message.unverified[firstID]
        // A late quote mismatch overrides any fetched text for this verse.
        let verses = issue == nil ? citedVerses(firstID: firstID, label: label, fetched: message.verses) : []
        if issue == nil, verses.isEmpty, message.delivery != .streaming {
            issue = .notFetched
        }
        if let issue {
            return CitedPassage(id: firstID, label: label, verses: verses, issue: issue, isVerified: false)
        }
        if message.delivery == .streaming {
            return CitedPassage(id: firstID, label: label, verses: verses, issue: nil, isVerified: false,
                                status: .pending)
        }
        let covered = coversLabel(firstID: firstID, label: label, fetched: message.verses)
        let checked = message.hasFinalCitationCheck && message.delivery == .complete && message.error == nil
        if checked && covered {
            return CitedPassage(id: firstID, label: label, verses: verses, issue: nil, isVerified: true)
        }
        let why: String
        if message.error != nil {
            why = CitedPassage.errorExplanation
        } else if message.delivery != .complete {
            why = CitedPassage.unfinishedExplanation
        } else if message.hasFinalCitationCheck && !covered {
            why = CitedPassage.partialExplanation
        } else {
            why = CitedPassage.genericExplanation
        }
        return CitedPassage(id: firstID, label: label, verses: verses, issue: nil, isVerified: false,
                            status: .unchecked, uncheckedExplanation: why)
    }

    /// Whether this turn's fetched verses cover everything the label names,
    /// with no new lookups. Conservative: whole chapters, cross-chapter spans,
    /// a label that starts elsewhere than the link, an unreadable range label
    /// and anything over `maxVersesPerPassage` count as not covered.
    static func coversLabel(firstID: String, label: String, fetched: [String: VerseRecord]) -> Bool {
        guard fetched[firstID] != nil, let first = BibleReference.parseVerseID(firstID) else { return false }
        let readable = referenceLabel(label)
        if let refs = try? BibleReference.parseReference(readable), !refs.isEmpty {
            return covers(refs, first: first, fetched: fetched)
        }
        // Specific references must establish their complete book identity;
        // matching numbers alone cannot verify a different fetched book.
        guard !readable.contains(where: \.isNumber), BibleCanon.find(readable) == nil else { return false }
        return !ReferenceScanner.inspect(in: readable).rejectedNumberedReference
    }

    static func referenceLabel(_ label: String) -> String {
        label.filter { !"*_~`".contains($0) }
    }

    /// Every verse of every ref fetched, the first starting at the link.
    static func covers(_ refs: [String], first: VerseID, fetched: [String: VerseRecord]) -> Bool {
        guard !refs.isEmpty, refs.count <= maxReferencesPerLabel else { return false }
        var expected = 0
        for (index, ref) in refs.enumerated() {
            guard let p = BibleReference.parsePassageRef(ref),
                  let startVerse = p.startVerse, let endVerse = p.endVerse,
                  p.startChapter == p.endChapter, endVerse >= startVerse else { return false }
            if index == 0 {
                guard p.book == first.book, p.startChapter == first.chapter,
                      startVerse == first.verse else { return false }
            }
            let count = endVerse - startVerse + 1
            guard expected + count <= maxVersesPerPassage else { return false }
            for verse in startVerse...endVerse where fetched["\(p.book).\(p.startChapter).\(verse)"] == nil {
                return false
            }
            expected += count
        }
        return true
    }

    /// The fetched verses for a link whose label may name a range
    /// ("John 1:1–3" linked to `JHN.1.1`). Stops at the first unfetched verse
    /// after a range start, at 40 verses, and after a bounded number of steps.
    /// If the label is unreadable, the linked verse alone is used.
    public static func citedVerses(firstID: String, label: String,
                                   fetched: [String: VerseRecord]) -> [VerseRecord] {
        var out: [VerseRecord] = []
        var seen = Set<String>()
        func add(_ id: String) {
            if let verse = fetched[id], seen.insert(id).inserted { out.append(verse) }
        }
        // A free-form label ("**John 3:16–18**") uses the English references in it.
        let readable = referenceLabel(label)
        let refs = (try? BibleReference.parseReference(readable))
            ?? ReferenceScanner.mentions(in: readable).flatMap(\.references)
        var steps = 0
        outer: for ref in refs.prefix(maxReferencesPerLabel) {
            guard let passage = BibleReference.parsePassageRef(ref) else { continue }
            for range in BibleReference.verseRanges(passage) {
                var verse = range.verseStart
                while verse <= range.verseEnd {
                    steps += 1
                    if steps > maxRangeSteps { break outer }
                    let id = "\(range.book).\(range.chapter).\(verse)"
                    // Whole chapters: stop at the first verse that was not fetched.
                    if fetched[id] == nil && verse > range.verseStart { break }
                    add(id)
                    if out.count >= maxVersesPerPassage { return out }
                    if verse == Int.max { break }
                    verse += 1
                }
            }
        }
        if !seen.contains(firstID) { add(firstID) }
        return out
    }

    /// `extractCitations`: `\[([^\]]+)\]\(verse:([1-3]?[A-Z]{2,3}\.\d{1,3}\.\d{1,3})\)`.
    public static func citations(in markdown: String) -> [InlineCitation] {
        locatedCitations(in: markdown).map(\.citation)
    }

    /// `citations(in:)` with the unicode-scalar offset of each link's "[".
    /// Links inside code (fences, inline code spans) are text, not citations.
    static func locatedCitations(in markdown: String) -> [(citation: InlineCitation, offset: Int)] {
        let s = Array(markdown.unicodeScalars)
        let prefix = Array("(verse:".unicodeScalars)
        let code = MarkdownCode.spans(in: s)
        var nextCode = 0
        var out: [(citation: InlineCitation, offset: Int)] = []
        var close = -1 // cached index of the next "]" at or after i
        var i = 0
        while i < s.count, out.count < maxCitationsPerMessage {
            while nextCode < code.count, code[nextCode].upperBound <= i { nextCode += 1 }
            if nextCode < code.count, code[nextCode].contains(i) {
                i = code[nextCode].upperBound
                continue
            }
            guard s[i] == "[" else { i += 1; continue }
            if close <= i {
                close = i + 1
                while close < s.count, s[close] != "]" { close += 1 }
            }
            // No "]" ahead: no later "[" can match either.
            if close >= s.count { break }
            let j = close
            guard j > i + 1, j + prefix.count < s.count,
                  Array(s[(j + 1)..<(j + 1 + prefix.count)]) == prefix else { i += 1; continue }
            let idStart = j + 1 + prefix.count
            var k = idStart
            while k < s.count, k - idStart <= 12, s[k] != ")" { k += 1 }
            guard k < s.count, s[k] == ")" else { i += 1; continue }
            // "[a `](verse:JHN.3.16)`": the link syntax itself sits in code.
            guard !MarkdownCode.contains(code, j), !MarkdownCode.contains(code, k) else { i += 1; continue }
            var id = String.UnicodeScalarView()
            id.append(contentsOf: s[idStart..<k])
            let idString = String(id)
            guard isCitationID(idString) else { i += 1; continue }
            var label = String.UnicodeScalarView()
            label.append(contentsOf: s[(i + 1)..<j])
            out.append((InlineCitation(label: String(label), verseID: idString), i))
            i = k + 1
        }
        return out
    }

    /// Shape only, as the web regex (`[1-3]?[A-Z]{2,3}.\d{1,3}.\d{1,3}`).
    static func isCitationID(_ id: String) -> Bool {
        let parts = id.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 3 && BibleReference.isBookCode(parts[0])
            && BibleReference.smallNumber(parts[1]) != nil
            && BibleReference.smallNumber(parts[2]) != nil
    }
}
