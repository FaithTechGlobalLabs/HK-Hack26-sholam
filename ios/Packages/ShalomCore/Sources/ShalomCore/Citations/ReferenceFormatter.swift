import Foundation

/// Human labels for USFM references, matching `passageLabel` and
/// `verseIdToLabel` in `src/lib/bible/refs.ts`.
public enum ReferenceFormatter {
    /// `JHN.3.16` -> `John 3:16`; `MAT.18.21-MAT.18.35` -> `Matthew 18:21–35`;
    /// `GEN.1.1-GEN.2.3` -> `Genesis 1:1–2:3`; `DAN.4` -> `Daniel 4`;
    /// `GEN.1-GEN.2` -> `Genesis 1–2`. Unreadable input is returned unchanged.
    public static func label(for reference: String) -> String {
        guard let p = BibleReference.parsePassageRef(reference) else { return reference }
        let name = BibleCanon.book(code: p.book)?.name ?? p.book
        guard let startVerse = p.startVerse else {
            return p.endChapter == p.startChapter
                ? "\(name) \(p.startChapter)"
                : "\(name) \(p.startChapter)–\(p.endChapter)"
        }
        let start = "\(name) \(p.startChapter):\(startVerse)"
        let endVerse = p.endVerse ?? startVerse
        if p.endChapter == p.startChapter && endVerse == startVerse { return start }
        return p.endChapter == p.startChapter
            ? "\(start)–\(endVerse)"
            : "\(start)–\(p.endChapter):\(endVerse)"
    }

    /// Verse number shown before each line of a cited range (`JHN.3.16` -> `16`).
    public static func verseNumber(_ id: String) -> String {
        id.split(separator: ".", omittingEmptySubsequences: false).last.map(String.init) ?? ""
    }
}
