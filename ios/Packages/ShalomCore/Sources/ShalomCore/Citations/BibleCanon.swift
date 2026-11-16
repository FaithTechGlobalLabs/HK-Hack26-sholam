import Foundation

/// One book of the 66-book canon, keyed by USFM code (`src/lib/bible/books.ts`).
public struct BibleBook: Equatable, Sendable {
    public let code: String
    public let name: String
    public let chapters: Int
    public let aliases: [String]
    public init(code: String, name: String, chapters: Int, aliases: [String] = []) {
        self.code = code; self.name = name; self.chapters = chapters; self.aliases = aliases
    }
}

/// The canon table and book-name lookup. Keep in step with `books.ts`.
public enum BibleCanon {
    public static let books: [BibleBook] = [
        BibleBook(code: "GEN", name: "Genesis", chapters: 50, aliases: ["gen", "ge", "gn"]),
        BibleBook(code: "EXO", name: "Exodus", chapters: 40, aliases: ["exod", "ex"]),
        BibleBook(code: "LEV", name: "Leviticus", chapters: 27, aliases: ["lev", "lv"]),
        BibleBook(code: "NUM", name: "Numbers", chapters: 36, aliases: ["num", "nm"]),
        BibleBook(code: "DEU", name: "Deuteronomy", chapters: 34, aliases: ["deut", "dt"]),
        BibleBook(code: "JOS", name: "Joshua", chapters: 24, aliases: ["josh"]),
        BibleBook(code: "JDG", name: "Judges", chapters: 21, aliases: ["judg", "jdgs"]),
        BibleBook(code: "RUT", name: "Ruth", chapters: 4, aliases: ["ru", "rth"]),
        BibleBook(code: "1SA", name: "1 Samuel", chapters: 31, aliases: ["1 sam", "1 sm"]),
        BibleBook(code: "2SA", name: "2 Samuel", chapters: 24, aliases: ["2 sam", "2 sm"]),
        BibleBook(code: "1KI", name: "1 Kings", chapters: 22, aliases: ["1 kgs", "1 kin"]),
        BibleBook(code: "2KI", name: "2 Kings", chapters: 25, aliases: ["2 kgs", "2 kin"]),
        BibleBook(code: "1CH", name: "1 Chronicles", chapters: 29, aliases: ["1 chr", "1 chron"]),
        BibleBook(code: "2CH", name: "2 Chronicles", chapters: 36, aliases: ["2 chr", "2 chron"]),
        BibleBook(code: "EZR", name: "Ezra", chapters: 10, aliases: ["ezr"]),
        BibleBook(code: "NEH", name: "Nehemiah", chapters: 13, aliases: ["neh"]),
        BibleBook(code: "EST", name: "Esther", chapters: 10, aliases: ["esth"]),
        BibleBook(code: "JOB", name: "Job", chapters: 42, aliases: ["jb"]),
        BibleBook(code: "PSA", name: "Psalms", chapters: 150, aliases: ["psalm", "ps", "pss", "psa"]),
        BibleBook(code: "PRO", name: "Proverbs", chapters: 31, aliases: ["prov", "prv", "pr"]),
        BibleBook(code: "ECC", name: "Ecclesiastes", chapters: 12, aliases: ["eccl", "eccles", "qoh"]),
        BibleBook(code: "SNG", name: "Song of Songs", chapters: 8, aliases: ["song", "song of solomon", "sos", "canticles"]),
        BibleBook(code: "ISA", name: "Isaiah", chapters: 66, aliases: ["isa", "is"]),
        BibleBook(code: "JER", name: "Jeremiah", chapters: 52, aliases: ["jer", "jr"]),
        BibleBook(code: "LAM", name: "Lamentations", chapters: 5, aliases: ["lam"]),
        BibleBook(code: "EZK", name: "Ezekiel", chapters: 48, aliases: ["ezek", "eze", "ezk"]),
        BibleBook(code: "DAN", name: "Daniel", chapters: 12, aliases: ["dan", "dn"]),
        BibleBook(code: "HOS", name: "Hosea", chapters: 14, aliases: ["hos"]),
        BibleBook(code: "JOL", name: "Joel", chapters: 3, aliases: ["jl"]),
        BibleBook(code: "AMO", name: "Amos", chapters: 9, aliases: ["am"]),
        BibleBook(code: "OBA", name: "Obadiah", chapters: 1, aliases: ["obad", "ob"]),
        BibleBook(code: "JON", name: "Jonah", chapters: 4, aliases: ["jnh"]),
        BibleBook(code: "MIC", name: "Micah", chapters: 7, aliases: ["mic"]),
        BibleBook(code: "NAM", name: "Nahum", chapters: 3, aliases: ["nah"]),
        BibleBook(code: "HAB", name: "Habakkuk", chapters: 3, aliases: ["hab"]),
        BibleBook(code: "ZEP", name: "Zephaniah", chapters: 3, aliases: ["zeph"]),
        BibleBook(code: "HAG", name: "Haggai", chapters: 2, aliases: ["hag"]),
        BibleBook(code: "ZEC", name: "Zechariah", chapters: 14, aliases: ["zech"]),
        BibleBook(code: "MAL", name: "Malachi", chapters: 4, aliases: ["mal"]),
        BibleBook(code: "MAT", name: "Matthew", chapters: 28, aliases: ["matt", "mt"]),
        BibleBook(code: "MRK", name: "Mark", chapters: 16, aliases: ["mk", "mrk"]),
        BibleBook(code: "LUK", name: "Luke", chapters: 24, aliases: ["lk"]),
        BibleBook(code: "JHN", name: "John", chapters: 21, aliases: ["jn", "jhn"]),
        BibleBook(code: "ACT", name: "Acts", chapters: 28, aliases: ["acts of the apostles"]),
        BibleBook(code: "ROM", name: "Romans", chapters: 16, aliases: ["rom", "rm"]),
        BibleBook(code: "1CO", name: "1 Corinthians", chapters: 16, aliases: ["1 cor"]),
        BibleBook(code: "2CO", name: "2 Corinthians", chapters: 13, aliases: ["2 cor"]),
        BibleBook(code: "GAL", name: "Galatians", chapters: 6, aliases: ["gal"]),
        BibleBook(code: "EPH", name: "Ephesians", chapters: 6, aliases: ["eph"]),
        BibleBook(code: "PHP", name: "Philippians", chapters: 4, aliases: ["phil", "php"]),
        BibleBook(code: "COL", name: "Colossians", chapters: 4, aliases: ["col"]),
        BibleBook(code: "1TH", name: "1 Thessalonians", chapters: 5, aliases: ["1 thess", "1 thes"]),
        BibleBook(code: "2TH", name: "2 Thessalonians", chapters: 3, aliases: ["2 thess", "2 thes"]),
        BibleBook(code: "1TI", name: "1 Timothy", chapters: 6, aliases: ["1 tim"]),
        BibleBook(code: "2TI", name: "2 Timothy", chapters: 4, aliases: ["2 tim"]),
        BibleBook(code: "TIT", name: "Titus", chapters: 3, aliases: ["tit"]),
        BibleBook(code: "PHM", name: "Philemon", chapters: 1, aliases: ["philem", "phm"]),
        BibleBook(code: "HEB", name: "Hebrews", chapters: 13, aliases: ["heb"]),
        BibleBook(code: "JAS", name: "James", chapters: 5, aliases: ["jas", "jm"]),
        BibleBook(code: "1PE", name: "1 Peter", chapters: 5, aliases: ["1 pet", "1 pt"]),
        BibleBook(code: "2PE", name: "2 Peter", chapters: 3, aliases: ["2 pet", "2 pt"]),
        BibleBook(code: "1JN", name: "1 John", chapters: 5, aliases: ["1 jn", "1 jhn"]),
        BibleBook(code: "2JN", name: "2 John", chapters: 1, aliases: ["2 jn", "2 jhn"]),
        BibleBook(code: "3JN", name: "3 John", chapters: 1, aliases: ["3 jn", "3 jhn"]),
        BibleBook(code: "JUD", name: "Jude", chapters: 1, aliases: ["jud", "jd"]),
        BibleBook(code: "REV", name: "Revelation", chapters: 22, aliases: ["rev", "rv", "revelations", "apocalypse"]),
    ]

    private static let byCode: [String: BibleBook] =
        Dictionary(books.map { ($0.code, $0) }, uniquingKeysWith: { first, _ in first })

    /// Same keys as the web's INDEX; later entries overwrite earlier ones, as `Map.set` does.
    private static let index: [String: BibleBook] = {
        var index: [String: BibleBook] = [:]
        for book in books {
            let keys = [book.code, book.name, book.name.filter { !$0.isWhitespace }] + book.aliases
            for key in keys { index[normalizeBookName(key)] = book }
        }
        return index
    }()

    public static func book(code: String) -> BibleBook? { byCode[code] }

    public static func find(_ name: String) -> BibleBook? { index[normalizeBookName(name)] }

    /// `normalizeBookName`: lowercase, periods to spaces, collapse spaces,
    /// fold I/II/III and First/Second/Third, and "1cor" -> "1 cor".
    public static func normalizeBookName(_ input: String) -> String {
        var s = input.lowercased().replacingOccurrences(of: ".", with: " ")
        s = s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        for (prefixes, digit) in [(["iii", "third"], "3"), (["ii", "second"], "2"), (["i", "first"], "1")] {
            var folded = false
            for prefix in prefixes where s.hasPrefix(prefix + " ") {
                s = digit + " " + s.dropFirst(prefix.count + 1)
                folded = true
                break
            }
            if folded { break }
        }
        // "1cor" / "1 cor" -> "1 cor"
        if let first = s.first, "123".contains(first) {
            let rest = s.dropFirst().drop(while: { $0 == " " })
            if let letter = rest.first, letter.isASCII, letter.isLetter, letter.isLowercase {
                s = String(first) + " " + rest
            }
        }
        return s
    }
}
