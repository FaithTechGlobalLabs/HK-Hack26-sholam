import Foundation

/// A parsed verse id `BOOK.chapter.verse`.
public struct VerseID: Equatable, Hashable, Sendable {
    public let book: String
    public let chapter: Int
    public let verse: Int
    public init(book: String, chapter: Int, verse: Int) {
        self.book = book; self.chapter = chapter; self.verse = verse
    }
    public var string: String { "\(book).\(chapter).\(verse)" }
}

/// A passage (`src/lib/bible/refs.ts`): nil verses mean whole chapters.
public struct Passage: Equatable, Sendable {
    public let book: String
    public let startChapter: Int
    public let startVerse: Int?
    public let endChapter: Int
    public let endVerse: Int?
}

/// One chapter span of a passage. `verseEnd == BibleReference.wholeChapterEnd`
/// means "to the end of the chapter".
public struct VerseRange: Equatable, Sendable {
    public let book: String
    public let chapter: Int
    public let verseStart: Int
    public let verseEnd: Int
}

public enum BibleReferenceError: Error, Equatable, Sendable {
    case unknownBook
    case missingBook
    case unreadable
    case invalidPassage
}

/// Ports of the verse-id, passage-ref and human-reference parsers in
/// `src/lib/bible/refs.ts`, written without regular expressions so they
/// stay Sendable and portable. Behaviour follows the web, including
/// one-chapter books ("Jude 11", "Philemon 8–16").
public enum BibleReference {
    public static let wholeChapterEnd = Int.max

    // MARK: Verse ids and passage refs

    /// `^([1-3]?[A-Z]{2,3})\.(\d{1,3})\.(\d{1,3})$`, checked against the canon.
    public static func parseVerseID(_ id: String) -> VerseID? {
        let parts = id.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3, isBookCode(parts[0]),
              let chapter = smallNumber(parts[1]), let verse = smallNumber(parts[2]),
              let book = BibleCanon.book(code: String(parts[0])),
              chapter >= 1, chapter <= book.chapters, verse >= 1
        else { return nil }
        return VerseID(book: book.code, chapter: chapter, verse: verse)
    }

    public static func isVerseID(_ id: String) -> Bool { parseVerseID(id) != nil }

    /// `JHN.3.16` -> `John 3:16`; the input unchanged when invalid.
    public static func verseLabel(_ id: String) -> String {
        guard let parsed = parseVerseID(id), let book = BibleCanon.book(code: parsed.book) else { return id }
        return "\(book.name) \(parsed.chapter):\(parsed.verse)"
    }

    private struct Point { let book: String; let chapter: Int; let verse: Int? }

    /// `^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3}))?$`
    private static func parsePoint(_ text: Substring) -> Point? {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2 || parts.count == 3, isBookCode(parts[0]),
              let chapter = smallNumber(parts[1]),
              let book = BibleCanon.book(code: String(parts[0])) else { return nil }
        var verse: Int?
        if parts.count == 3 {
            guard let v = smallNumber(parts[2]) else { return nil }
            verse = v
        }
        guard chapter >= 1, chapter <= book.chapters, verse != 0 else { return nil }
        return Point(book: book.code, chapter: chapter, verse: verse)
    }

    /// Structural check only, as on the web (verse bounds live in the database).
    public static func parsePassageRef(_ ref: String) -> Passage? {
        let pieces = ref.split(separator: "-", omittingEmptySubsequences: false)
        guard pieces.count == 1 || pieces.count == 2, let start = parsePoint(pieces[0]) else { return nil }
        guard let end = pieces.count == 2 ? parsePoint(pieces[1]) : start,
              end.book == start.book,
              (start.verse == nil) == (end.verse == nil) else { return nil }
        let order = { (p: Point) in p.chapter * 1000 + (p.verse ?? 0) }
        guard order(end) >= order(start) else { return nil }
        return Passage(book: start.book, startChapter: start.chapter, startVerse: start.verse,
                       endChapter: end.chapter, endVerse: end.verse)
    }

    public static func isPassageRef(_ ref: String) -> Bool { parsePassageRef(ref) != nil }

    /// One range per chapter; open ends use `wholeChapterEnd`.
    public static func verseRanges(_ p: Passage) -> [VerseRange] {
        let startVerse = p.startVerse ?? 1
        let endVerse = p.endVerse ?? wholeChapterEnd
        if p.startChapter == p.endChapter {
            return [VerseRange(book: p.book, chapter: p.startChapter, verseStart: startVerse, verseEnd: endVerse)]
        }
        var ranges = [VerseRange(book: p.book, chapter: p.startChapter, verseStart: startVerse, verseEnd: wholeChapterEnd)]
        if p.startChapter + 1 < p.endChapter {
            for chapter in (p.startChapter + 1)..<p.endChapter {
                ranges.append(VerseRange(book: p.book, chapter: chapter, verseStart: 1, verseEnd: wholeChapterEnd))
            }
        }
        ranges.append(VerseRange(book: p.book, chapter: p.endChapter, verseStart: 1, verseEnd: endVerse))
        return ranges
    }

    // MARK: Human references

    /// `parseReference`: "John 3:16" -> ["JHN.3.16"], "Jude 11" -> ["JUD.1.11"],
    /// "1 Cor 13:4, 7" -> ["1CO.13.4", "1CO.13.7"]. Throws on an unknown book
    /// or an unreadable part.
    public static func parseReference(_ input: String) throws -> [String] {
        var out: [String] = []
        var book: String?
        var chapter: Int?
        var lastHadVerse = false

        for raw in input.split(whereSeparator: { $0 == ";" || $0 == "," }) {
            var part = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if part.hasSuffix(".") { part.removeLast() }
            if part.isEmpty { continue }

            var numbers = Substring(part)
            let named = splitBookAndRest(part)
            if let named {
                guard let found = BibleCanon.find(String(named.book)) else { throw BibleReferenceError.unknownBook }
                book = found.code
                chapter = nil
                numbers = named.rest
            } else if book == nil {
                throw BibleReferenceError.missingBook
            }
            guard let code = book,
                  let m = parseNumbers(numbers.trimmingCharacters(in: .whitespacesAndNewlines))
            else { throw BibleReferenceError.unreadable }

            let ref: String
            let continuesVerses = named == nil && lastHadVerse && chapter != nil && m.n2 == nil
            if continuesVerses, let current = chapter {
                ref = m.n3.map { "\(code).\(current).\(m.n1)-\(code).\(current).\($0)" } ?? "\(code).\(current).\(m.n1)"
            } else if m.n2 == nil, BibleCanon.book(code: code)?.chapters == 1, m.n1 > 1 || m.n3 != nil {
                // One-chapter books cite verses without a chapter; "Jude 1" stays the book.
                chapter = 1
                lastHadVerse = true
                ref = m.n3.map { "\(code).1.\(m.n1)-\(code).1.\($0)" } ?? "\(code).1.\(m.n1)"
            } else if m.n2 == nil {
                chapter = m.n1
                lastHadVerse = false
                ref = m.n3.map { "\(code).\(m.n1)-\(code).\($0)" } ?? "\(code).\(m.n1)"
            } else if let n2 = m.n2 {
                chapter = m.n1
                lastHadVerse = true
                if let n3 = m.n3, let n4 = m.n4 {
                    ref = "\(code).\(m.n1).\(n2)-\(code).\(n3).\(n4)"
                } else if let n3 = m.n3 {
                    ref = "\(code).\(m.n1).\(n2)-\(code).\(m.n1).\(n3)"
                } else {
                    ref = "\(code).\(m.n1).\(n2)"
                }
            } else {
                throw BibleReferenceError.unreadable
            }
            guard isPassageRef(ref) else { throw BibleReferenceError.invalidPassage }
            out.append(ref)
        }
        return out
    }

    /// `^((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]*?)\s*(\d.*)$`
    private static func splitBookAndRest(_ part: String) -> (book: Substring, rest: Substring)? {
        var i = part.startIndex
        if let first = part.first, "123".contains(first) {
            i = part.index(after: i)
            while i < part.endIndex, part[i].isWhitespace { i = part.index(after: i) }
        }
        guard i < part.endIndex, isASCIILetter(part[i]) else { return nil }
        i = part.index(after: i)
        while i < part.endIndex {
            let c = part[i]
            if isASCIIDigit(c) { return (part[..<i], part[i...]) }
            guard isASCIILetter(c) || c == "." || c.isWhitespace else { return nil }
            i = part.index(after: i)
        }
        return nil
    }

    private struct Numbers { let n1: Int; let n2: Int?; let n3: Int?; let n4: Int? }

    /// `^(\d{1,3})(?::(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3})(?::(\d{1,3}))?)?$`
    private static func parseNumbers(_ text: String) -> Numbers? {
        let chars = Array(text)
        var i = 0
        func digits() -> Int? {
            var value = 0, count = 0
            while i < chars.count, isASCIIDigit(chars[i]) {
                if count == 3 { return nil }
                value = value * 10 + Int(chars[i].asciiValue! - 48)
                count += 1; i += 1
            }
            return count == 0 ? nil : value
        }
        guard let n1 = digits() else { return nil }
        var n2: Int?, n3: Int?, n4: Int?
        if i < chars.count, chars[i] == ":" {
            i += 1
            guard let v = digits() else { return nil }
            n2 = v
        }
        if i < chars.count {
            while i < chars.count, chars[i].isWhitespace { i += 1 }
            guard i < chars.count, ["-", "–", "—"].contains(chars[i]) else { return nil }
            i += 1
            while i < chars.count, chars[i].isWhitespace { i += 1 }
            guard let v = digits() else { return nil }
            n3 = v
            if i < chars.count, chars[i] == ":" {
                i += 1
                guard let w = digits() else { return nil }
                n4 = w
            }
        }
        guard i == chars.count else { return nil }
        return Numbers(n1: n1, n2: n2, n3: n3, n4: n4)
    }

    // MARK: Helpers

    static func isBookCode(_ s: Substring) -> Bool {
        var letters = s
        if let first = s.first, "123".contains(first) { letters = s.dropFirst() }
        return (2...3).contains(letters.count) && letters.allSatisfy { $0.isASCII && $0.isUppercase && $0.isLetter }
    }

    /// 1–3 ASCII digits.
    static func smallNumber(_ s: Substring) -> Int? {
        guard (1...3).contains(s.count), s.allSatisfy(isASCIIDigit) else { return nil }
        return Int(s)
    }

    private static func isASCIIDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }
    private static func isASCIILetter(_ c: Character) -> Bool { c.isASCII && c.isLetter }
}
