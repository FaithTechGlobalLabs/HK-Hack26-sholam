import Foundation

/// A plain-text Bible reference written in an answer ("Romans 8:28",
/// "Jonah 1:1–3, 17"), as opposed to a `verse:` link. The server's citation
/// check never covers these, so they are listed but never shown as checked.
public struct ReferenceMention: Equatable, Sendable {
    /// Exact matched text, comma continuations included ("Jonah 1:1–3, 17").
    public let text: String
    /// USFM passage ref of the first part, e.g. "ROM.8.28" or "JHN.3.16-JHN.3.18".
    public let reference: String
    /// First verse of the first part, e.g. "ROM.8.28".
    public let firstVerseID: String
    /// Unicode-scalar offsets of `text` in the markdown.
    public let range: Range<Int>
    /// Every passage ref in order: "Jonah 1:1–3, 17" -> ["JON.1.1-JON.1.3", "JON.1.17"].
    public let references: [String]
    /// The leading `PLAIN_REF`-shaped part ("Jonah 1:1–3"); the web names
    /// plain references in `quoteWarnings` with exactly this text.
    public let primaryText: String

    public init(text: String, reference: String, firstVerseID: String, range: Range<Int>,
                references: [String]? = nil, primaryText: String? = nil) {
        self.text = text; self.reference = reference; self.firstVerseID = firstVerseID
        self.range = range
        self.references = references ?? [reference]
        self.primaryText = primaryText ?? text
    }

    /// Readable label: the canonical label of the first part, then any comma
    /// continuations exactly as written ("Rom. 8:28, 30" -> "Romans 8:28, 30"),
    /// so a tail like ", 17" is never dropped.
    public var label: String {
        let head = ReferenceFormatter.label(for: reference)
        let primaryCount = primaryText.unicodeScalars.count
        guard text.unicodeScalars.count > primaryCount else { return head }
        var tail = String.UnicodeScalarView()
        tail.append(contentsOf: text.unicodeScalars.dropFirst(primaryCount))
        let collapsed = String(tail).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return head + collapsed
    }
}

/// Finds plain-text references with `PLAIN_REF` parity (`src/lib/agent/citations.ts`),
/// plus comma continuations, without regular expressions. One forward walk
/// over the unicode scalars; book words and parsed mentions are bounded.
/// Numbered-name separators are consumed once, even when too long to accept.
public enum ReferenceScanner {
    public static let maxMentionsPerMessage = 100
    /// Longest single book-name word ("Thessalonians" is 13).
    static let maxBookWordLength = 16
    /// Most comma continuations kept in one mention.
    static let maxContinuations = 8
    /// Longest mention, continuations included.
    static let maxMentionLength = 96
    /// How far the streaming partial-tail check looks.
    static let tailLookahead = 48
    /// Longest link destination that still counts as one link.
    static let maxLinkDestination = 2048
    static let ordinalWords = [
        "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
        "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
        "eighty", "ninety", "hundred", "thousand", "million", "billion", "trillion",
        "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
        "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth",
        "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
        "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth",
        "ninetieth", "hundredth", "thousandth", "millionth", "billionth", "trillionth", "nth",
    ]

    static func isNumberedWord(_ token: String) -> Bool {
        let word = token.precomposedStringWithCompatibilityMapping.lowercased()
        guard !word.isEmpty else { return false }
        if ordinalWords.contains(word) || ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "teenth", "tieth", "illionth"].contains(where: { word.hasSuffix($0) }) { return true }
        if word.unicodeScalars.allSatisfy({ "ivxlcdm".unicodeScalars.contains($0) }) { return true }
        let digits = word.prefix(while: \.isNumber)
        return !digits.isEmpty && ["", "st", "nd", "rd", "th"].contains(String(word.dropFirst(digits.count)))
    }

    public static func mentions(in markdown: String, streaming: Bool = false) -> [ReferenceMention] {
        inspect(in: markdown, streaming: streaming).mentions
    }

    /// A rejected numbered name must not become an opaque single-verse label
    /// in the resolver ("**Second John 3:16**" is not Gospel John).
    static func inspect(in markdown: String, streaming: Bool = false)
        -> (mentions: [ReferenceMention], rejectedNumberedReference: Bool) {
        var scan = Scan(s: Array(markdown.unicodeScalars), streaming: streaming)
        let mentions = scan.run()
        return (mentions, scan.rejectedNumberedReference)
    }

    // MARK: Scalar classes

    static func isUpper(_ c: Unicode.Scalar) -> Bool { c.value >= 65 && c.value <= 90 }
    static func isLower(_ c: Unicode.Scalar) -> Bool { c.value >= 97 && c.value <= 122 }
    static func isDigit(_ c: Unicode.Scalar) -> Bool { c.value >= 48 && c.value <= 57 }
    static func isAlnum(_ c: Unicode.Scalar) -> Bool { isUpper(c) || isLower(c) || isDigit(c) }
    static func isInlineSpace(_ c: Unicode.Scalar) -> Bool {
        c == " " || c == "\t" || c == "\u{00A0}" || c == "\u{202F}"
    }
    static func isDash(_ c: Unicode.Scalar) -> Bool { c == "-" || c == "–" || c == "—" }
    static func isWhitespace(_ c: Unicode.Scalar) -> Bool { c.properties.isWhitespace }
    /// Characters that may still be arriving after a reference while streaming.
    static func isPartialTail(_ c: Unicode.Scalar) -> Bool {
        isInlineSpace(c) || isDash(c) || c == ":" || c == "," || isDigit(c)
    }

    // MARK: Scan

    enum LinkResult { case complete(Int), notLink, unclosedTail }
    enum Candidate { case hit(ReferenceMention), skip(Int), rejectedNumbered(Int), none }

    struct Scan {
        let s: [Unicode.Scalar]
        let streaming: Bool
        var rejectedNumberedReference = false
        var close = -1                   // cached index of the next "]" at or after the current "["
        var noCloseAhead = false
        /// For each "(": the index of its balanced ")" on the same line,
        /// `unmatched` when a line break comes first, `openToEnd` when the text ends first.
        let parenMatch: [Int: Int]
        static let unmatched = -1
        static let openToEnd = -2

        init(s: [Unicode.Scalar], streaming: Bool) {
            self.s = s; self.streaming = streaming
            // One pass with a stack keeps link detection linear.
            var match: [Int: Int] = [:]
            var stack: [Int] = []
            for (index, c) in s.enumerated() {
                if c == "(" {
                    stack.append(index)
                } else if c == ")" {
                    if let open = stack.popLast() { match[open] = index }
                } else if c == "\n" {
                    for open in stack { match[open] = Scan.unmatched }
                    stack.removeAll(keepingCapacity: true)
                }
            }
            for open in stack { match[open] = Scan.openToEnd }
            parenMatch = match
        }

        var n: Int { s.count }

        mutating func run() -> [ReferenceMention] {
            var out: [ReferenceMention] = []
            let code = MarkdownCode.spans(in: s)
            var nextCode = 0
            var i = 0
            while i < n, out.count < maxMentionsPerMessage {
                // Code (fences, inline code spans) is skipped whole.
                while nextCode < code.count, code[nextCode].upperBound <= i { nextCode += 1 }
                if nextCode < code.count, code[nextCode].contains(i) {
                    i = code[nextCode].upperBound
                    continue
                }
                let c = s[i]
                if c == "[" {
                    switch link(at: i) {
                    case .complete(let end): i = end
                    case .unclosedTail: return out
                    case .notLink: i += 1
                    }
                    continue
                }
                guard atBoundary(i) else { i += 1; continue }
                if let end = urlEnd(at: i) { i = end; continue }
                if isUpper(c) || isLower(c) || isDigit(c) {
                    switch candidate(at: i) {
                    case .hit(let mention):
                        out.append(mention)
                        i = mention.range.upperBound
                    case .skip(let end):
                        i = max(end, i + 1)
                    case .rejectedNumbered(let end):
                        rejectedNumberedReference = true
                        i = max(end, i + 1)
                    case .none:
                        i += 1
                    }
                    continue
                }
                i += 1
            }
            return out
        }

        // MARK: Exclusions

        /// `[label](dest)` from the "[" at `i`: the label is up to the first "]".
        mutating func link(at i: Int) -> LinkResult {
            if noCloseAhead { return streaming ? .unclosedTail : .notLink }
            if close <= i {
                close = i + 1
                while close < n, s[close] != "]" { close += 1 }
            }
            guard close < n else {
                noCloseAhead = true
                return streaming ? .unclosedTail : .notLink
            }
            let j = close
            guard j + 1 < n else { return streaming ? .unclosedTail : .notLink }
            guard s[j + 1] == "(" else { return .notLink }
            let match = parenMatch[j + 1] ?? Scan.unmatched
            if match >= 0 {
                return match - (j + 1) <= maxLinkDestination ? .complete(match + 1) : .notLink
            }
            if match == Scan.openToEnd, streaming { return .unclosedTail }
            return .notLink
        }

        /// Bare URLs and autolinks (`http://`, `https://`, `www.`) to the next space.
        func urlEnd(at i: Int) -> Int? {
            func has(_ prefix: String) -> Bool {
                var j = i
                for p in prefix.unicodeScalars {
                    guard j < n else { return false }
                    var c = s[j]
                    if isUpper(c), let lower = Unicode.Scalar(c.value + 32) { c = lower }
                    guard c == p else { return false }
                    j += 1
                }
                return true
            }
            guard has("http://") || has("https://") || has("www.") else { return nil }
            var j = i
            while j < n, !isWhitespace(s[j]), s[j] != "<", s[j] != ">", s[j] != "\"", s[j] != "`" { j += 1 }
            return j
        }

        /// JS `\b` before a word character; "_" counts as a boundary so
        /// `_Romans 8:28_` (Markdown emphasis) is still found.
        func atBoundary(_ i: Int) -> Bool { i == 0 || !isAlnum(s[i - 1]) }

        // MARK: Candidates

        func text(_ range: Range<Int>) -> String {
            var view = String.UnicodeScalarView()
            view.append(contentsOf: s[range])
            return String(view)
        }

        func omittedNumberedPrefix(before start: Int, skipConjunction: Bool = true) -> Bool {
            if start > 1, isDash(s[start - 1]), isAlnum(s[start - 2]) { return true }
            var end = start
            let lower = max(0, start - maxMentionLength)
            while end > lower, isInlineSpace(s[end - 1]) || isDash(s[end - 1]) || "*_~`".unicodeScalars.contains(s[end - 1]) {
                end -= 1
            }
            var begin = end
            while begin > lower, isAlnum(s[begin - 1]) || Character(s[begin - 1]).isNumber {
                begin -= 1
            }
            if begin > 0, ":：.".unicodeScalars.contains(s[begin - 1]) { return false }
            if skipConjunction, text(begin..<end).lowercased() == "and" {
                return omittedNumberedPrefix(before: begin, skipConjunction: false)
            }
            let token = text(begin..<end)
            if !skipConjunction, !token.isEmpty, token.allSatisfy(\.isNumber) { return false }
            return begin < end && isNumberedWord(token)
        }

        /// 1–3 digits not followed by another digit.
        func number(at i: Int) -> Int? {
            var j = i
            while j < n, isDigit(s[j]), j - i < 3 { j += 1 }
            guard j > i, j >= n || !isDigit(s[j]) else { return nil }
            return j
        }

        /// `[A-Z][a-z]+`, bounded. A numbered name uses the canon's
        /// case-insensitive spelling instead of falling back to its suffix.
        func word(at i: Int, numbered: Bool = false) -> Int? {
            guard i < n, isUpper(s[i]) || (numbered && isLower(s[i])) else { return nil }
            var j = i + 1
            while j < n, isLower(s[j]) || (numbered && isUpper(s[j])) {
                j += 1
                if j - i > maxBookWordLength { return nil }
            }
            return numbered || j > i + 1 ? j : nil
        }

        /// Arabic, English ordinal or Roman prefix. Canon lookup below decides
        /// whether the complete name exists; unsupported ordinals/Romans must
        /// not expose an unnumbered suffix ("IV John" is not Gospel John).
        func numberedPrefixEnd(at start: Int) -> Int? {
            var end = start
            if isDigit(s[start]) {
                while end < n, isDigit(s[end]) { end += 1 }
                // "1. John 3:16" is an ordered-list item, not "1 John".
                if end + 1 < n, s[end] == ".", isWhitespace(s[end + 1]) { return nil }
                if end + 1 < n, ["st", "nd", "rd", "th"].contains(text(end..<(end + 2))) {
                    var q = end + 2
                    while q < n, isWhitespace(s[q]) { q += 1 }
                    // "1th 5:1" can name Thessalonians; "1st John" is an
                    // unsupported numbered name that must stay whole.
                    if word(at: q, numbered: true) != nil { end += 2 }
                }
            } else {
                // A compact spelling such as "FirstJohn" is not canonical,
                // but must still be rejected whole rather than trusted as an
                // opaque label or restarted at a suffix.
                for ordinal in ordinalWords {
                    var q = start
                    for letter in ordinal.unicodeScalars {
                        guard q < n else { break }
                        let c = isUpper(s[q]) ? Unicode.Scalar(s[q].value + 32)! : s[q]
                        guard c == letter else { break }
                        q += 1
                    }
                    if q - start == ordinal.unicodeScalars.count {
                        end = q
                        break
                    }
                }
                if end == start {
                    var q = start
                    while q < n, q - start < maxMentionLength, isUpper(s[q]) || isLower(s[q]) { q += 1 }
                    if q > start, isNumberedWord(text(start..<q)) { end = q }
                }
                if end == start {
                    while end < n, "IVXLCDMivxlcdm".unicodeScalars.contains(s[end]) { end += 1 }
                    guard end > start else { return nil }
                    if end < n, isUpper(s[end]) || isLower(s[end]) {
                        guard let suffixEnd = word(at: end, numbered: true),
                              isUpper(s[end]) || BibleCanon.find(text(end..<suffixEnd)) != nil else { return nil }
                    }
                }
            }
            if end < n, s[end] == "." { end += 1 }
            return end
        }

        /// Original `PLAIN_REF` numbers, plus the canon parser's compact or
        /// whitespace-separated numbers for a complete numbered book name.
        func numbers(afterBook bookEnd: Int, numbered: Bool = false) -> Int? {
            var p = bookEnd
            if p < n, s[p] == "." { p += 1 }
            if numbered {
                while p < n, isWhitespace(s[p]) { p += 1 }
            } else {
                guard p < n, s[p] == " " || s[p] == "\u{00A0}" else { return nil }
                p += 1
            }
            guard let chapterEnd = number(at: p), chapterEnd < n, s[chapterEnd] == ":",
                  let verseEnd = number(at: chapterEnd + 1) else { return nil }
            return rangeTail(after: verseEnd) ?? verseEnd
        }

        /// `\s?[-–—]\s?\d{1,3}(:\d{1,3})?`
        func rangeTail(after end: Int) -> Int? {
            var q = end
            if q < n, isInlineSpace(s[q]) { q += 1 }
            guard q < n, isDash(s[q]) else { return nil }
            q += 1
            if q < n, isInlineSpace(s[q]) { q += 1 }
            guard let first = number(at: q) else { return nil }
            if first < n, s[first] == ":", let second = number(at: first + 1) { return second }
            return first
        }

        /// A continuation group: `\d{1,3}(:\d{1,3})?` plus an optional range.
        func group(at q: Int) -> Int? {
            guard let first = number(at: q) else { return nil }
            var end = first
            if first < n, s[first] == ":" {
                guard let second = number(at: first + 1) else { return nil }
                end = second
            }
            return rangeTail(after: end) ?? end
        }

        func candidate(at start: Int) -> Candidate {
            if omittedNumberedPrefix(before: start) { return .rejectedNumbered(start) }
            var wordStart = start
            var numbered = false
            if let prefixEnd = numberedPrefixEnd(at: start) {
                var q = prefixEnd
                while q < n, isWhitespace(s[q]) || ".*_~`".unicodeScalars.contains(s[q]) { q += 1 }
                // A Roman-shaped alias such as "Mic 6:8" remains a book when
                // no second name follows it.
                if word(at: q, numbered: true) != nil {
                    wordStart = q
                    numbered = true
                }
            }
            guard let wordEnd = word(at: wordStart, numbered: numbered) else { return .none }

            // Optional " of [A-Z][a-z]+" ("Song of Songs"); without it if that fails.
            var bookEnds: [Int] = []
            if wordEnd + 4 < n, s[wordEnd] == " ", s[wordEnd + 1] == "o", s[wordEnd + 2] == "f",
               s[wordEnd + 3] == " ", let ofEnd = word(at: wordEnd + 4) {
                bookEnds.append(ofEnd)
            }
            bookEnds.append(wordEnd)

            for bookEnd in bookEnds {
                // Long separators/prefixes are walked once, never passed to
                // the canon or reference parser as an unbounded candidate.
                guard bookEnd - start <= maxMentionLength else { return .rejectedNumbered(bookEnd) }
                guard let coreEnd = numbers(afterBook: bookEnd, numbered: numbered) else { continue }
                guard coreEnd - start <= maxMentionLength else { return .rejectedNumbered(coreEnd) }
                guard BibleCanon.find(text(start..<bookEnd)) != nil else {
                    if numbered { return .rejectedNumbered(coreEnd) }
                    continue
                }
                let result = validate(start: start, coreEnd: coreEnd)
                if numbered, case .skip(let end) = result { return .rejectedNumbered(end) }
                return result
            }
            // Even an unsupported shape/number must consume the entire name;
            // restarting at John would change the book's identity. Unknown
            // prose ("I read John 3:16") may still reach the later reference.
            if numbered, BibleCanon.find(text(start..<wordEnd)) != nil
                || BibleCanon.find(text(wordStart..<wordEnd)) != nil {
                return .rejectedNumbered(wordEnd)
            }
            return .none
        }

        /// A known book with an invalid chapter, verse or range is dropped and
        /// the scan resumes after it, so "2 John 3:16" never becomes "John 3:16".
        func validate(start: Int, coreEnd: Int) -> Candidate {
            let primary = text(start..<coreEnd)
            guard let refs = try? BibleReference.parseReference(primary), refs.count == 1,
                  let passage = BibleReference.parsePassageRef(refs[0]),
                  let firstVerse = passage.startVerse
            else { return .skip(coreEnd) }
            let firstID = "\(passage.book).\(passage.startChapter).\(firstVerse)"
            guard BibleReference.parseVerseID(firstID) != nil else { return .skip(coreEnd) }

            var references = refs
            var end = coreEnd
            var last = order(passage.endChapter, passage.endVerse ?? firstVerse)
            var added = 0
            while added < maxContinuations, end < n, s[end] == "," {
                var q = end + 1
                var spaces = 0
                while q < n, isInlineSpace(s[q]), spaces < 2 { q += 1; spaces += 1 }
                guard let groupEnd = group(at: q), groupEnd - start <= maxMentionLength else { break }
                // "17th", "39 times": not a verse continuation.
                guard continuationEnds(at: groupEnd) else { break }
                // ", 1 John 4:8" starts a new numbered book, not verse 1.
                if groupEnd == q + 1, "123".unicodeScalars.contains(s[q]) {
                    var r = groupEnd
                    if r < n, isInlineSpace(s[r]) { r += 1 }
                    if r < n, isUpper(s[r]) { break }
                }
                guard let all = try? BibleReference.parseReference(text(start..<groupEnd)),
                      all.count == references.count + 1,
                      let next = BibleReference.parsePassageRef(all[all.count - 1]),
                      next.book == passage.book
                else { break }
                // Continuations only move forward ("Romans 8:28, 10 people" is prose).
                let from = order(next.startChapter, next.startVerse ?? 1)
                guard from > last else { break }
                last = order(next.endChapter, next.endVerse ?? (next.startVerse ?? 1))
                references = all
                end = groupEnd
                added += 1
            }

            if streaming {
                // "John 3:1" while "6" is still arriving.
                var k = end
                while k < n, k - end < tailLookahead, isPartialTail(s[k]) { k += 1 }
                if k >= n { return .skip(n) }
            }

            return .hit(ReferenceMention(
                text: text(start..<end), reference: references[0], firstVerseID: firstID,
                range: start..<end, references: references, primaryText: primary
            ))
        }

        func order(_ chapter: Int, _ verse: Int) -> Int { chapter * 1000 + verse }

        /// What may follow a comma continuation: the end, punctuation, a line
        /// break, or a space then a non-letter, a capital (", 17 NIV)") or
        /// "and"/"or". A space then any other lowercase word ("39 times") or a
        /// digit means the number is prose, not a verse.
        func continuationEnds(at end: Int) -> Bool {
            guard end < n else { return true }
            let c = s[end]
            if isAlnum(c) || c == ":" { return false }
            guard isInlineSpace(c) else { return true }
            var k = end
            while k < n, isInlineSpace(s[k]), k - end < 4 { k += 1 }
            guard k < n else { return true }
            let next = s[k]
            if isDigit(next) { return false }
            guard isLower(next) else { return true }
            var w = k
            while w < n, isLower(s[w]), w - k < 4 { w += 1 }
            if w < n, isAlnum(s[w]) { return false }
            var word = String.UnicodeScalarView()
            word.append(contentsOf: s[k..<w])
            return String(word) == "and" || String(word) == "or"
        }
    }
}

/// Code regions of a Markdown answer as sorted, non-overlapping unicode-scalar
/// ranges, found in linear time. Shared by verse-link extraction and the
/// plain-reference scanner so nothing inside code counts as a source.
///
/// - Fences: a line starting (after any spaces or tabs, and after list or
///   quote markers such as "1. ", "- ", "> ") with 3+ "`" or "~"; a backtick
///   fence's info may not contain "`" (same rule as `MarkdownBlockParser`).
///   Closed by a line of 3+ of the same marker, at least as long, with only
///   whitespace after; unterminated runs to the end.
/// - A plain "```" line inside a paragraph that has an odd number of
///   3-backtick runs closes that inline span instead of opening a fence
///   ("Example ```\n…\n```"), so text after it stays visible.
/// - Inline code: a backtick run closed by the next run of the same length in
///   the same paragraph (CommonMark), so "``a ` b``" is one span. An unclosed
///   run of 3+ backticks runs to the next fence or the end (web `blankCode`).
/// - Indented code blocks are not code here, because `MarkdownBlockParser`
///   renders them as text (their links stay visible and tappable).
enum MarkdownCode {
    private struct Run { let start: Int; let length: Int; let paragraph: Int; let gap: Int }

    static func spans(in s: [Unicode.Scalar]) -> [Range<Int>] {
        let n = s.count
        var spans: [Range<Int>] = []
        var runs: [Run] = []
        var gapEnds: [Int] = []          // where each stretch between fences ends
        var paragraph = 0
        var fence: (marker: Unicode.Scalar, length: Int, start: Int, inContainer: Bool)?
        var runCounts: [Int: Int] = [:]  // backtick runs per length in the current paragraph
        var lineStart = 0

        while lineStart < n {
            var lineEnd = lineStart
            while lineEnd < n, s[lineEnd] != "\n" { lineEnd += 1 }
            let next = lineEnd < n ? lineEnd + 1 : n
            var p = lineStart
            while p < lineEnd, s[p] == " " || s[p] == "\t" { p += 1 }
            let indentEnd = p
            if fence == nil {
                // A list item or quote starts a new block: inline code cannot cross it.
                let content = containerContentStart(s, from: p, to: lineEnd)
                if content != p {
                    paragraph += 1
                    runCounts.removeAll(keepingCapacity: true)
                    p = content
                }
            } else if fence?.inContainer == true {
                // A fence opened in a list item or quote closes inside it too.
                p = containerContentStart(s, from: p, to: lineEnd)
            }
            var markerEnd = p
            if p < lineEnd, s[p] == "`" || s[p] == "~" {
                while markerEnd < lineEnd, s[markerEnd] == s[p] { markerEnd += 1 }
            }
            let markerLength = markerEnd - p

            if let open = fence {
                if markerLength >= open.length, s[p] == open.marker,
                   s[markerEnd..<lineEnd].allSatisfy({ $0.properties.isWhitespace }) {
                    spans.append(open.start..<lineEnd)
                    fence = nil
                }
                lineStart = next
                continue
            }
            if markerLength >= 3,
               s[p] == "~" || !s[markerEnd..<lineEnd].contains("`"),
               !(s[p] == "`" && (runCounts[markerLength] ?? 0) % 2 == 1) {
                gapEnds.append(lineStart)
                fence = (s[p], markerLength, lineStart, p != indentEnd)
                runCounts.removeAll(keepingCapacity: true)
                lineStart = next
                continue
            }
            if s[indentEnd..<lineEnd].allSatisfy({ $0.properties.isWhitespace }) {
                paragraph += 1
                runCounts.removeAll(keepingCapacity: true)
            } else {
                var j = p
                while j < lineEnd {
                    guard s[j] == "`" else { j += 1; continue }
                    var k = j
                    while k < lineEnd, s[k] == "`" { k += 1 }
                    runs.append(Run(start: j, length: k - j, paragraph: paragraph, gap: gapEnds.count))
                    runCounts[k - j, default: 0] += 1
                    j = k
                }
            }
            lineStart = next
        }
        if let open = fence { spans.append(open.start..<n) }
        gapEnds.append(n)

        // Pair each opener with the next run of the same length: per-length
        // cursors only move forward, so the whole pass is linear.
        var byLength: [Int: [Int]] = [:]
        for (index, run) in runs.enumerated() { byLength[run.length, default: []].append(index) }
        var cursor: [Int: Int] = [:]
        var index = 0
        while index < runs.count {
            let run = runs[index]
            let list = byLength[run.length] ?? []
            var c = cursor[run.length] ?? 0
            while c < list.count, list[c] <= index { c += 1 }
            cursor[run.length] = c
            if c < list.count, runs[list[c]].paragraph == run.paragraph, runs[list[c]].gap == run.gap {
                let closer = runs[list[c]]
                spans.append(run.start..<(closer.start + closer.length))
                index = list[c] + 1
                continue
            }
            if run.length >= 3 {
                spans.append(run.start..<gapEnds[run.gap])
                while index < runs.count, runs[index].gap == run.gap { index += 1 }
                continue
            }
            index += 1
        }
        return spans.sorted { $0.lowerBound < $1.lowerBound }
    }

    /// After list and quote markers ("1. ", "2) ", "- ", "* ", "+ ", "> "),
    /// at most four of them, each followed by spaces.
    static func containerContentStart(_ s: [Unicode.Scalar], from start: Int, to end: Int) -> Int {
        func isBlank(_ c: Unicode.Scalar) -> Bool { c == " " || c == "\t" }
        var p = start
        for _ in 0..<4 {
            guard p < end else { break }
            var q = p
            if s[q] == ">" {
                q += 1
            } else if s[q] == "-" || s[q] == "*" || s[q] == "+" {
                guard q + 1 < end, isBlank(s[q + 1]) else { break }
                q += 1
            } else if ReferenceScanner.isDigit(s[q]) {
                while q < end, q - p < 9, ReferenceScanner.isDigit(s[q]) { q += 1 }
                guard q + 1 < end, s[q] == "." || s[q] == ")", isBlank(s[q + 1]) else { break }
                q += 1
            } else {
                break
            }
            while q < end, isBlank(s[q]) { q += 1 }
            p = q
        }
        return p
    }

    /// Whether `index` lies in one of the sorted `spans` (binary search).
    static func contains(_ spans: [Range<Int>], _ index: Int) -> Bool {
        var low = 0, high = spans.count
        while low < high {
            let mid = (low + high) / 2
            if spans[mid].upperBound <= index { low = mid + 1 } else { high = mid }
        }
        return low < spans.count && spans[low].contains(index)
    }
}
