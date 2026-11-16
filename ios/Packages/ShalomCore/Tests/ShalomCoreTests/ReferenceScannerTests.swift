import Foundation
import XCTest
@testable import ShalomCore

final class ReferenceScannerTests: XCTestCase {
    private func refs(_ text: String, streaming: Bool = false) -> [String] {
        ReferenceScanner.mentions(in: text, streaming: streaming).map(\.reference)
    }

    private func texts(_ text: String, streaming: Bool = false) -> [String] {
        ReferenceScanner.mentions(in: text, streaming: streaming).map(\.text)
    }

    // MARK: Matches

    func testPlainReference() throws {
        let mention = try XCTUnwrap(ReferenceScanner.mentions(in: "Read Romans 8:28 today.").first)
        XCTAssertEqual(mention.text, "Romans 8:28")
        XCTAssertEqual(mention.reference, "ROM.8.28")
        XCTAssertEqual(mention.firstVerseID, "ROM.8.28")
        XCTAssertEqual(mention.references, ["ROM.8.28"])
        XCTAssertEqual(mention.primaryText, "Romans 8:28")
        XCTAssertEqual(mention.range, 5..<16)
        XCTAssertEqual(mention.label, "Romans 8:28")
    }

    func testFormattedAndUnsupportedOrdinalsDoNotExposeJohnSuffix() {
        for label in ["Twenty-first John 3:16", "Twenty first John 3:16", "Twenty and first John 3:16", "Onehundredandfirst John 3:16", "**First** John 3:16", "_First_ John 3:16", "`First` John 3:16", "**IV** John 3:16", "Eleventh John 3:16", "Twelfth John 3:16", "Thirteenth John 3:16", "Twentieth John 3:16", "Hundredth John 3:16", "Quintillionth John 3:16", "Nth John 3:16"] {
            XCTAssertEqual(refs(label), [], label)
            XCTAssertEqual(refs(label + "; John 3:16"), ["JHN.3.16"], label)
        }
    }

    func testNumberedBooksComeFirst() {
        XCTAssertEqual(refs("God is love (1 John 4:8)."), ["1JN.4.8"])
        XCTAssertEqual(texts("God is love (1 John 4:8)."), ["1 John 4:8"], "no extra John 4:8")
        XCTAssertEqual(refs("1John 4:8"), ["1JN.4.8"])
        XCTAssertEqual(refs("3 John 1:4"), ["3JN.1.4"])
    }

    func testNumberedBookAliases() {
        XCTAssertEqual(refs("1 Cor 13:4"), ["1CO.13.4"])
        XCTAssertEqual(refs("1Cor. 13:4"), ["1CO.13.4"])
        XCTAssertEqual(refs("2 Tim. 3:16"), ["2TI.3.16"])
        XCTAssertEqual(refs("1 Pet 5:7"), ["1PE.5.7"])
        XCTAssertEqual(refs("2 Kgs 2:11"), ["2KI.2.11"])
        XCTAssertEqual(texts("2 Tim. 3:16"), ["2 Tim. 3:16"])
    }

    func testWholeNumberedNamesPreserveBookIdentity() throws {
        let cases = [
            ("1", "1JN", 3, 16), ("First", "1JN", 3, 16), ("I", "1JN", 3, 16),
            ("2", "2JN", 1, 6), ("Second", "2JN", 1, 6), ("II", "2JN", 1, 6),
            ("3", "3JN", 1, 6), ("Third", "3JN", 1, 6), ("III", "3JN", 1, 6),
        ]
        for (prefix, code, chapter, verse) in cases {
            for gap in [" ", ""] {
                let text = "\(prefix) John\(gap)\(chapter):\(verse)"
                let mentions = ReferenceScanner.mentions(in: text)
                XCTAssertEqual(mentions.count, 1, text)
                let mention = try XCTUnwrap(mentions.first, text)
                let id = "\(code).\(chapter).\(verse)"
                XCTAssertEqual(mention.reference, id, text)
                XCTAssertEqual(mention.firstVerseID, id, text)
                XCTAssertEqual(mention.references, [id], text)
                XCTAssertEqual(mention.text, text)
                XCTAssertEqual(mention.primaryText, text)
                XCTAssertEqual(mention.range, 0..<text.unicodeScalars.count, text)
                XCTAssertEqual(mention.label, BibleReference.verseLabel(id), text)
            }
        }
    }

    func testNumberedNameNormalizationUsesTheWholeName() {
        for text in ["First. John 3:16", "I. John3:16", "first JOHN3:16",
                     "I\tJohn\u{00A0}3:16", "First   John  3:16", "First\nJohn3:16"] {
            XCTAssertEqual(refs(text), ["1JN.3.16"], text)
            XCTAssertEqual(texts(text), [text], text)
        }
        XCTAssertEqual(refs("SECOND jn1:6"), ["2JN.1.6"])
        XCTAssertEqual(refs("3Jhn1:6"), ["3JN.1.6"])
        XCTAssertEqual(refs("1Th 5:1; 1Thess 5:1; 1th 5:1; 2Th 1:1"),
                       ["1TH.5.1", "1TH.5.1", "1TH.5.1", "2TH.1.1"])
        XCTAssertEqual(refs("First Cor 13:4; II Kgs 2:11; Third Jn 1:6"),
                       ["1CO.13.4", "2KI.2.11", "3JN.1.6"])
        // Roman-shaped aliases and ordinary ordered-list markers are unchanged.
        XCTAssertEqual(refs("Mic 6:8; Lv 1:1; 1. John 3:16"), ["MIC.6.8", "LEV.1.1", "JHN.3.16"])
        XCTAssertEqual(refs("I read John 3:16"), ["JHN.3.16"])
    }

    func testInvalidNumberedBookIsNotReadAsTheUnnumberedOne() {
        // 2 John has one chapter: the whole match is dropped, never "John 3:16".
        XCTAssertEqual(refs("2 John 3:16"), [])
        // Unknown complete numbered names are conservatively left alone too.
        XCTAssertEqual(refs("chapter 1 Romans 8:28"), [])
    }

    func testUnsupportedNumberedNamesNeverExposeAnUnnumberedSuffix() {
        for text in ["Second John3:16", "II John 3:16", "Third John3:16", "III John 3:16",
                     "First John0:16", "I John3:0", "Second John 1:1234", "Third John 1000:1",
                     "4 John 3:16", "IV John3:16", "Fourth John 3:16", "1st John 3:16",
                     "IIII John 3:16", "11 John3:16", "FirstJohn 3:16", "IJohn3:16", "IVJohn 3:16",
                     "First John 3:16–2:1", "II John 1:6–5", "Third Peter 1:6", "III Samuel 1:6"] {
            XCTAssertEqual(refs(text), [], text)
            XCTAssertEqual(refs(text + "; John 3:16."), ["JHN.3.16"], text + " does not hide later references")
        }
    }

    func testNumberedReferencesKeepRangesContinuationsAndScalarOrdering() throws {
        let text = "日 First John 3:16–18, 20; II John1:6; John 3:16."
        let mentions = ReferenceScanner.mentions(in: text)
        XCTAssertEqual(mentions.map(\.reference), ["1JN.3.16-1JN.3.18", "2JN.1.6", "JHN.3.16"])
        let first = try XCTUnwrap(mentions.first)
        XCTAssertEqual(first.references, ["1JN.3.16-1JN.3.18", "1JN.3.20"])
        XCTAssertEqual(first.text, "First John 3:16–18, 20")
        XCTAssertEqual(first.primaryText, "First John 3:16–18")
        XCTAssertEqual(first.label, "1 John 3:16–18, 20")
        XCTAssertEqual(first.range, 2..<(2 + first.text.unicodeScalars.count))
        for (previous, next) in zip(mentions, mentions.dropFirst()) {
            XCTAssertLessThan(previous.range.upperBound, next.range.lowerBound)
        }
        XCTAssertEqual(texts("Romans 8:28, First John3:16, II John1:6, III John1:6"),
                       ["Romans 8:28", "First John3:16", "II John1:6", "III John1:6"])
    }

    func testNumberedReferencesRespectLinksCodeAndURLExclusions() {
        for text in ["[First John3:16](verse:1JN.3.16)", "[II John1:6](https://example.com)",
                     "`Third John1:6`", "``I John3:16``", "```\nSecond John1:6\n```",
                     "~~~text\nIII John1:6\n~~~", "https://example.com/First%20John3:16",
                     "<https://example.com/II%20John1:6>", "www.example.com/Third%20John1:6"] {
            XCTAssertEqual(refs(text), [], text)
            XCTAssertEqual(refs(text + "\nFirst John3:16."), ["1JN.3.16"], text)
        }
        XCTAssertEqual(refs("[First John3:16", streaming: true), [])
        XCTAssertEqual(refs("[II John1:6](verse:2JN.1", streaming: true), [])
    }

    func testNumberedStreamingTailsNeverExposeTheSuffix() {
        for (text, ref) in [("First John3:16", "1JN.3.16"), ("I John3:16", "1JN.3.16"),
                            ("Second John1:6", "2JN.1.6"), ("II John1:6", "2JN.1.6"),
                            ("Third John1:6", "3JN.1.6"), ("III John1:6", "3JN.1.6")] {
            XCTAssertEqual(refs(text, streaming: true), [], text)
            XCTAssertEqual(refs(text), [ref], text)
            XCTAssertEqual(refs(text + ".", streaming: true), [ref], text)
        }
        XCTAssertEqual(refs("Second John3:16.", streaming: true), [])
        XCTAssertEqual(refs("First John3:16–", streaming: true), [])
    }

    func testLongNumberedPrefixesAndSeparatorsAreRejectedWhole() {
        XCTAssertEqual(refs("First" + String(repeating: " ", count: 100_000) + "John 3:16"), [])
        XCTAssertEqual(refs("I John" + String(repeating: " ", count: 100_000) + "3:16"), [])
        XCTAssertEqual(refs(String(repeating: "I", count: 100_000) + " John 3:16"), [])
        XCTAssertEqual(refs(String(repeating: "1", count: 100_000) + " John 3:16"), [])
        XCTAssertEqual(refs(String(repeating: "Second John3:16; ", count: 10_000)), [])
        XCTAssertEqual(refs(String(repeating: "First John3:16; ", count: 1_000)).count,
                       ReferenceScanner.maxMentionsPerMessage)
    }

    func testBookNameForms() {
        XCTAssertEqual(refs("Song of Songs 2:4"), ["SNG.2.4"])
        XCTAssertEqual(refs("Song of Solomon 2:4"), ["SNG.2.4"])
        XCTAssertEqual(refs("Rom. 8:28"), ["ROM.8.28"])
        XCTAssertEqual(texts("Rom. 8:28"), ["Rom. 8:28"], "exact text, as the web's quoteWarnings label")
        XCTAssertEqual(refs("Ps 23:1"), ["PSA.23.1"])
        XCTAssertEqual(refs("Gospel of John 3:16"), ["JHN.3.16"], "an unknown 'X of Y' name falls back")
        XCTAssertEqual(refs("John\u{00A0}3:16"), ["JHN.3.16"])
    }

    func testRanges() throws {
        XCTAssertEqual(refs("John 3:16–18"), ["JHN.3.16-JHN.3.18"])
        XCTAssertEqual(refs("John 3:16-18"), ["JHN.3.16-JHN.3.18"])
        XCTAssertEqual(refs("John 3:16 — 18"), ["JHN.3.16-JHN.3.18"])
        let cross = try XCTUnwrap(ReferenceScanner.mentions(in: "Genesis 1:31–2:2").first)
        XCTAssertEqual(cross.reference, "GEN.1.31-GEN.2.2")
        XCTAssertEqual(cross.firstVerseID, "GEN.1.31")
        XCTAssertEqual(cross.label, "Genesis 1:31–2:2")
        // A backwards range is not a passage.
        XCTAssertEqual(refs("John 3:16–2:1"), [])
        XCTAssertEqual(refs("John 3:16-15"), [])
    }

    func testCommaContinuationsAreKept() throws {
        let mention = try XCTUnwrap(ReferenceScanner.mentions(in: "Read Jonah 1:1–3, 17.").first)
        XCTAssertEqual(mention.text, "Jonah 1:1–3, 17")
        XCTAssertEqual(mention.primaryText, "Jonah 1:1–3")
        XCTAssertEqual(mention.reference, "JON.1.1-JON.1.3")
        XCTAssertEqual(mention.references, ["JON.1.1-JON.1.3", "JON.1.17"])
        XCTAssertEqual(mention.firstVerseID, "JON.1.1")
        XCTAssertEqual(mention.label, "Jonah 1:1–3, 17", "the tail is never dropped")
        XCTAssertEqual(mention.range, 5..<20)

        XCTAssertEqual(ReferenceScanner.mentions(in: "Jonah 1:17, 2:10").first?.references,
                       ["JON.1.17", "JON.2.10"])
        XCTAssertEqual(ReferenceScanner.mentions(in: "Rom. 8:28, 30").first?.label, "Romans 8:28, 30")
        XCTAssertEqual(ReferenceScanner.mentions(in: "John 3:16, 18–20.").first?.references,
                       ["JHN.3.16", "JHN.3.18-JHN.3.20"])
    }

    func testContinuationStopsAtProseAndNewBooks() {
        XCTAssertEqual(texts("Romans 8:28, 1 John 4:8"), ["Romans 8:28", "1 John 4:8"])
        XCTAssertEqual(texts("Romans 8:28, 10 people agreed"), ["Romans 8:28"], "continuations only move forward")
        XCTAssertEqual(texts("John 3:16, 17th century"), ["John 3:16"])
        XCTAssertEqual(texts("Genesis 1:31–2:2, 5"), ["Genesis 1:31–2:2"])
        XCTAssertEqual(texts("John 3:16,17"), ["John 3:16,17"])
        XCTAssertEqual(texts("Romans 8:28, 39 times"), ["Romans 8:28"], "a count, not verse 39")
        XCTAssertEqual(texts("Jonah 1:1–3, 17 tonight"), ["Jonah 1:1–3"])
        XCTAssertEqual(texts("Romans 8:28, 39 1/2"), ["Romans 8:28"])
        XCTAssertEqual(texts("Jonah 1:1–3, 17 and 2:10"), ["Jonah 1:1–3, 17"])
        XCTAssertEqual(texts("(Jonah 1:1–3, 17 NIV)"), ["Jonah 1:1–3, 17"])
        XCTAssertEqual(texts("Jonah 1:1–3, 17\nNext line"), ["Jonah 1:1–3, 17"])
    }

    func testEmphasisAndPunctuationAround() {
        XCTAssertEqual(refs("**John 3:16**"), ["JHN.3.16"])
        XCTAssertEqual(refs("_Romans 8:28_"), ["ROM.8.28"])
        XCTAssertEqual(refs("(Romans 8:28; John 3:16)"), ["ROM.8.28", "JHN.3.16"])
    }

    // MARK: Rejections

    func testRejectedShapes() {
        XCTAssertEqual(refs("Daniel 4"), [], "bare chapters are not mentions")
        XCTAssertEqual(refs("Juan 3:16"), [])
        XCTAssertEqual(refs("John 22:1"), [])
        XCTAssertEqual(refs("John 3:0"), [])
        XCTAssertEqual(refs("At 3:16 we left."), [])
        XCTAssertEqual(refs("xJohn 3:16"), [], "needs a word boundary")
        XCTAssertEqual(refs("JOHN 3:16"), [])
        XCTAssertEqual(refs("John 3:1234"), [])
        XCTAssertEqual(refs("John 1000:1"), [])
    }

    // MARK: Exclusions

    func testFencedCodeIsSkipped() {
        XCTAssertEqual(refs("```\nRomans 8:28\n```\nJohn 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("Intro\n```swift\nRomans 8:28"), [], "unterminated fence runs to the end")
        XCTAssertEqual(refs("~~~\nRomans 8:28\n~~~\nafter John 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("~~~text\nRomans 8:28"), [])
        XCTAssertEqual(refs("inline ```Romans 8:28``` then John 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("  ```\n  Romans 8:28\n  ```\nJohn 3:16"), ["JHN.3.16"], "indented fence")
        XCTAssertEqual(refs("````\n```\nRomans 8:28\n````\nJohn 3:16"), ["JHN.3.16"], "a shorter run does not close")
        XCTAssertEqual(refs("```\r\nRomans 8:28\r\n```\r\nJohn 3:16"), ["JHN.3.16"])
        // Indented code blocks render as text in the app, so they are not code here.
        XCTAssertEqual(refs("Intro\n\n    Romans 8:28"), ["ROM.8.28"])
    }

    func testListItemFencesAndInlineClosers() {
        XCTAssertEqual(refs("1. ```\n   Romans 8:28\n   ```\n\nThen John 3:16."), ["JHN.3.16"])
        XCTAssertEqual(refs("- ```\n  Romans 8:28\n  ```\n\nAlso John 3:16."), ["JHN.3.16"])
        XCTAssertEqual(refs("Example ```\nRomans 8:28\n```\n\nThen John 3:16."), ["JHN.3.16"],
                       "the ``` line closes the inline span, so text after it stays visible")
        XCTAssertEqual(refs("> ```\n> Romans 8:28\n> ```\nJohn 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("```\n- ```\nRomans 8:28\n```\nJohn 3:16"), ["JHN.3.16"])
        // An unclosed list-item fence still hides everything after it.
        XCTAssertEqual(refs("- ```\n  Romans 8:28\n\nJohn 3:16"), [])
    }

    func testInlineCodeIsSkipped() {
        XCTAssertEqual(refs("Use `Romans 8:28` here, and John 3:16."), ["JHN.3.16"])
        XCTAssertEqual(refs("A lone ` tick, then Romans 8:28"), ["ROM.8.28"])
        XCTAssertEqual(refs("`a\nRomans 8:28`"), [], "inline code spans lines within a paragraph")
        XCTAssertEqual(refs("`a\n\nRomans 8:28`"), ["ROM.8.28"], "but not a blank line")
        XCTAssertEqual(refs("``a ` Romans 8:28``"), [], "multi-backtick span")
        XCTAssertEqual(refs("``a`` Romans 8:28"), ["ROM.8.28"])
        XCTAssertEqual(refs("```x`` Romans 8:28 ``"), [], "an unclosed triple run hides the rest")
    }

    func testLinksAreSkippedWholly() {
        XCTAssertEqual(refs("[Romans 8:28](verse:ROM.8.28)"), [])
        XCTAssertEqual(refs("[see John 3:16](https://example.com/x)"), [])
        XCTAssertEqual(refs("[a [Romans 8:28](verse:ROM.8.28) b] and John 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("[Wiki](https://en.wikipedia.org/wiki/A_(b)) John 3:16"), ["JHN.3.16"])
        XCTAssertEqual(refs("[note] Romans 8:28"), ["ROM.8.28"], "brackets without a destination are text")
        XCTAssertEqual(refs("[John 3:16]"), ["JHN.3.16"])
    }

    func testURLsAreSkipped() {
        XCTAssertEqual(refs("Visit https://example.com/John 3:16 now"), [])
        XCTAssertEqual(refs("<https://example.com/Romans> and Romans 8:28"), ["ROM.8.28"])
        let mentions = ReferenceScanner.mentions(in: "www.example.org/Romans%208:28 and Romans 8:28")
        XCTAssertEqual(mentions.map(\.reference), ["ROM.8.28"])
        XCTAssertEqual(mentions.first?.range.lowerBound, 34)
    }

    func testStreamingUnclosedLinkIsSkipped() {
        XCTAssertEqual(refs("See [John 3:16", streaming: true), [])
        XCTAssertEqual(refs("See [John 3:16](verse:JHN.3", streaming: true), [])
        XCTAssertEqual(refs("See [John 3:16]", streaming: true), [])
        XCTAssertEqual(refs("Romans 8:28 then [John 3:16", streaming: true), ["ROM.8.28"])
        XCTAssertEqual(refs("See [John 3:16", streaming: false), ["JHN.3.16"])
    }

    // MARK: Streaming tail

    func testPartialTailWhileStreaming() {
        XCTAssertEqual(refs("…John 3:1", streaming: true), [])
        XCTAssertEqual(refs("…John 3:1", streaming: false), ["JHN.3.1"])
        XCTAssertEqual(refs("John 3:16–", streaming: true), [])
        XCTAssertEqual(refs("John 3:16, ", streaming: true), [])
        XCTAssertEqual(refs("Jonah 1:1–3, 1", streaming: true), [])
        XCTAssertEqual(refs("John 3:16 is", streaming: true), ["JHN.3.16"])
        XCTAssertEqual(refs("John 3:16.", streaming: true), ["JHN.3.16"])
    }

    // MARK: Bounds

    func testMentionsAreCapped() {
        let text = String(repeating: "Romans 8:28. ", count: 20_000)
        XCTAssertGreaterThan(text.count, 200_000)
        XCTAssertEqual(ReferenceScanner.mentions(in: text).count, ReferenceScanner.maxMentionsPerMessage)
    }

    func testCodeSpansAreSortedAndLinear() {
        let s = Array("a `x` ``y`` ```\nz\n```".unicodeScalars)
        let spans = MarkdownCode.spans(in: s)
        // The "```" line closes the mid-line ``` run as one inline span.
        XCTAssertEqual(spans, [2..<5, 6..<11, 12..<21])
        XCTAssertTrue(MarkdownCode.contains(spans, 7))
        XCTAssertFalse(MarkdownCode.contains(spans, 5))
        // Many unmatched runs of different lengths.
        let runs = (1...3_000).map { String(repeating: "`", count: $0 % 40 + 1) + " x " }.joined()
        _ = MarkdownCode.spans(in: Array(runs.unicodeScalars))
        // Backticks pair 1–2, 3–4, …: only the 1st and 3rd references are in
        // code; the 2nd and 4th sit between a closer and the next opener.
        let alternating = String(repeating: "` Romans 8:28 ", count: 4)
        let found = ReferenceScanner.mentions(in: alternating)
        XCTAssertEqual(found.map(\.range.lowerBound), [16, 44])
        XCTAssertEqual(MarkdownCode.spans(in: Array(alternating.unicodeScalars)), [0..<15, 28..<43])
        // At scale every other reference is text, so the cap applies.
        XCTAssertEqual(refs(String(repeating: "` Romans 8:28 ", count: 2_000)).count,
                       ReferenceScanner.maxMentionsPerMessage)
        XCTAssertEqual(refs(String(repeating: "`Romans 8:28` ", count: 2_000)).count, 0, "every reference wrapped")
    }

    func testPathologicalInputsStayLinear() {
        XCTAssertEqual(refs(String(repeating: "[", count: 100_000)), [])
        XCTAssertEqual(refs(String(repeating: "[", count: 100_000), streaming: true), [])
        XCTAssertEqual(refs(String(repeating: "[a](", count: 50_000)), [])
        XCTAssertEqual(refs(String(repeating: "`", count: 100_001)), [])
        XCTAssertEqual(refs(String(repeating: "A", count: 200_000) + " 3:16"), [])
        XCTAssertEqual(refs(String(repeating: "1 ", count: 100_000)), [])
        XCTAssertEqual(refs(String(repeating: "John 3:16, ", count: 30_000), streaming: true).count,
                       ReferenceScanner.maxMentionsPerMessage)
        XCTAssertEqual(refs(String(repeating: "[a](", count: 50_000), streaming: true), [])
        XCTAssertEqual(refs(String(repeating: "[a](b ", count: 30_000) + "\nRomans 8:28").count, 1)
        // The partial-tail check looks a bounded distance ahead.
        XCTAssertLessThanOrEqual(refs("John 3:16" + String(repeating: " ", count: 100_000), streaming: true).count, 1)
    }
}
