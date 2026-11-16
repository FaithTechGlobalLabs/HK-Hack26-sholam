import Foundation
import XCTest
@testable import ShalomCore

final class MarkdownBlockParserTests: XCTestCase {
    private typealias Kind = MarkdownBlock.Kind

    private func parse(_ text: String, incompleteTail: Bool = false) -> [Kind] {
        MarkdownBlockParser.blocks(text, incompleteTail: incompleteTail).map(\.kind)
    }

    private func pairs(_ text: String, incompleteTail: Bool = false) -> [(Kind, String)] {
        MarkdownBlockParser.blocks(text, incompleteTail: incompleteTail).map { ($0.kind, $0.text) }
    }

    private func assertBlocks(_ text: String, _ expected: [(Kind, String)], incompleteTail: Bool = false,
                              file: StaticString = #filePath, line: UInt = #line) {
        let actual = pairs(text, incompleteTail: incompleteTail)
        XCTAssertEqual(actual.map { $0.0 }, expected.map { $0.0 }, "kinds", file: file, line: line)
        XCTAssertEqual(actual.map { $0.1 }, expected.map { $0.1 }, "texts", file: file, line: line)
    }

    // MARK: Lists

    func testOrderedNumbersAreKept() {
        assertBlocks("1. One\n2) Two\n\n3. Three", [
            (.ordered(number: 1, depth: 0), "One"),
            (.ordered(number: 2, depth: 0), "Two"),
            (.ordered(number: 3, depth: 0), "Three"),
        ])
        assertBlocks("3. Start\n4. Next", [
            (.ordered(number: 3, depth: 0), "Start"),
            (.ordered(number: 4, depth: 0), "Next"),
        ])
        XCTAssertEqual(parse("123456789. Big"), [.ordered(number: 123_456_789, depth: 0)])
        XCTAssertEqual(parse("1234567890. Too big"), [.paragraph])
    }

    func testNumbersThatAreNotItems() {
        assertBlocks("1.5 million people", [(.paragraph, "1.5 million people")])
        assertBlocks("2024 was a year", [(.paragraph, "2024 was a year")])
        assertBlocks("1.", [(.paragraph, "1.")])
        assertBlocks("3)x", [(.paragraph, "3)x")])
    }

    func testBulletsAndDepth() {
        assertBlocks("- a\n  - b\n    + c\n* d", [
            (.bullet(depth: 0), "a"),
            (.bullet(depth: 1), "b"),
            (.bullet(depth: 2), "c"),
            (.bullet(depth: 0), "d"),
        ])
        XCTAssertEqual(parse("\t- tab"), [.bullet(depth: 2)], "a tab is four spaces")
        XCTAssertEqual(parse("          - deep"), [.bullet(depth: 3)], "depth is capped at 3")
        XCTAssertEqual(parse("   1. nested"), [.ordered(number: 1, depth: 1)])
    }

    func testBoldLineIsNotABullet() {
        assertBlocks("**Bold** line", [(.paragraph, "**Bold** line")])
        assertBlocks("-", [(.paragraph, "-")])
        assertBlocks("--", [(.paragraph, "--")])
    }

    func testContinuationLinesJoinTheItem() {
        assertBlocks("- first line\nstill first\n- second", [
            (.bullet(depth: 0), "first line still first"),
            (.bullet(depth: 0), "second"),
        ])
        assertBlocks("1. Step\n   more detail", [(.ordered(number: 1, depth: 0), "Step more detail")])
    }

    func testBlankLineEndsAList() {
        assertBlocks("- a\n\nafter", [(.bullet(depth: 0), "a"), (.paragraph, "after")])
        assertBlocks("Intro:\n- a\n- b", [(.paragraph, "Intro:"), (.bullet(depth: 0), "a"), (.bullet(depth: 0), "b")])
    }

    // MARK: Quotes, headings, rules

    func testQuotesMerge() {
        assertBlocks("> one\n>two\nafter", [(.quote, "one two"), (.paragraph, "after")])
        assertBlocks("> a\n>\n> b", [(.quote, "a"), (.quote, "b")])
        assertBlocks("> > nested", [(.quote, "nested")])
        assertBlocks("Text\n> quoted", [(.paragraph, "Text"), (.quote, "quoted")])
    }

    func testHeadings() {
        assertBlocks("#hashtag here", [(.paragraph, "#hashtag here")])
        assertBlocks("### Title ###", [(.heading(level: 3), "Title")])
        assertBlocks("# C#", [(.heading(level: 1), "C#")])
        assertBlocks("###### Six", [(.heading(level: 6), "Six")])
        assertBlocks("####### Seven", [(.paragraph, "####### Seven")])
        assertBlocks("##", [(.heading(level: 2), "")])
        assertBlocks("Para\n## Next", [(.paragraph, "Para"), (.heading(level: 2), "Next")])
    }

    func testRules() {
        XCTAssertEqual(parse("---"), [.rule])
        XCTAssertEqual(parse("***"), [.rule])
        XCTAssertEqual(parse("___"), [.rule])
        XCTAssertEqual(parse("- - -"), [.rule], "checked before bullets")
        XCTAssertEqual(parse("-----"), [.rule])
        XCTAssertEqual(parse("Text\n---\nMore"), [.paragraph, .rule, .paragraph])
    }

    // MARK: Code

    func testFenceWithLanguage() {
        assertBlocks("```swift\nlet x = 1\n  indented\n```\nafter", [
            (.code(language: "swift"), "let x = 1\n  indented"),
            (.paragraph, "after"),
        ])
    }

    func testUnterminatedFenceRunsToTheEnd() {
        assertBlocks("Intro\n```\ncode line\n# not a heading", [
            (.paragraph, "Intro"),
            (.code(language: nil), "code line\n# not a heading"),
        ])
    }

    func testTildeFence() {
        assertBlocks("~~~\nraw\n- not a bullet\n~~~", [(.code(language: nil), "raw\n- not a bullet")])
        assertBlocks("~~~ text\nraw\n```\nstill code\n~~~", [(.code(language: "text"), "raw\n```\nstill code")])
    }

    func testListItemFences() {
        assertBlocks("1. ```\n   [John 3:16](verse:JHN.3.16)\n   ```\n\nThen Romans 8:28 applies.", [
            (.ordered(number: 1, depth: 0), ""),
            (.code(language: nil), "   [John 3:16](verse:JHN.3.16)"),
            (.paragraph, "Then Romans 8:28 applies."),
        ])
        assertBlocks("- ```swift\n  let x = 1\n  ```\n\nAlso Romans 8:28.", [
            (.bullet(depth: 0), ""),
            (.code(language: "swift"), "  let x = 1"),
            (.paragraph, "Also Romans 8:28."),
        ])
    }

    func testFenceLineCanCloseAnInlineSpan() {
        assertBlocks("Example ```\n[John 3:16](verse:JHN.3.16)\n```\n\nThen Romans 8:28.", [
            (.paragraph, "Example ``` [John 3:16](verse:JHN.3.16) ```"),
            (.paragraph, "Then Romans 8:28."),
        ])
        assertBlocks("- a ```\n  ```", [(.bullet(depth: 0), "a ``` ```")])
        // An even count (already closed) lets the line open a real fence.
        assertBlocks("a ```x```\n```\ncode", [(.paragraph, "a ```x```"), (.code(language: nil), "code")])
        // A list-marked line does not close a top-level fence.
        assertBlocks("```\n- ```\n[John 3:16](verse:JHN.3.16)\n```\nRomans 8:28", [
            (.code(language: nil), "- ```\n[John 3:16](verse:JHN.3.16)"),
            (.paragraph, "Romans 8:28"),
        ])
    }

    func testInlineTripleBackticksAreText() {
        assertBlocks("```code``` here", [(.paragraph, "```code``` here")])
    }

    // MARK: Paragraphs and line endings

    func testParagraphLinesJoin() {
        assertBlocks("a\nb\n\nc", [(.paragraph, "a b"), (.paragraph, "c")])
        XCTAssertEqual(MarkdownBlockParser.blocks(""), [])
        XCTAssertEqual(MarkdownBlockParser.blocks("\n\n  \n"), [])
    }

    func testCRLF() {
        assertBlocks("# Title\r\n\r\n- a\r\n- b\r\n", [
            (.heading(level: 1), "Title"),
            (.bullet(depth: 0), "a"),
            (.bullet(depth: 0), "b"),
        ])
        assertBlocks("line one\r\nline two", [(.paragraph, "line one line two")])
        assertBlocks("old\rmac", [(.paragraph, "old mac")])
        assertBlocks("```\r\ncode\r\n```", [(.code(language: nil), "code")])
    }

    func testIDsAreSequential() {
        let blocks = MarkdownBlockParser.blocks("# A\n\nb\n\n- c\n- d")
        XCTAssertEqual(blocks.map(\.id), [0, 1, 2, 3])
    }

    // MARK: Unfinished tail

    func testStableTailTable() {
        XCTAssertEqual(MarkdownBlockParser.stableTail("See [John 3:16](verse:JHN.3"), "See John 3:16")
        XCTAssertEqual(MarkdownBlockParser.stableTail("See [John 3:1"), "See John 3:1")
        XCTAssertEqual(MarkdownBlockParser.stableTail("See [a](b) done"), "See [a](b) done")
    }

    func testStableTailEdges() {
        XCTAssertEqual(MarkdownBlockParser.stableTail("See [John 3:16]"), "See John 3:16")
        XCTAssertEqual(MarkdownBlockParser.stableTail("Text [a](b) and [c](verse:X"), "Text [a](b) and c")
        XCTAssertEqual(MarkdownBlockParser.stableTail("[a [b"), "a b")
        XCTAssertEqual(MarkdownBlockParser.stableTail("[note] then text"), "[note] then text")
        XCTAssertEqual(MarkdownBlockParser.stableTail("Wiki [x](https://w/A_(b)) end"), "Wiki [x](https://w/A_(b)) end")
        XCTAssertEqual(MarkdownBlockParser.stableTail("Wiki [x](https://w/A_(b"), "Wiki x")
        XCTAssertEqual(MarkdownBlockParser.stableTail("code `[x` here"), "code `[x` here")
        XCTAssertEqual(MarkdownBlockParser.stableTail("escaped \\[x"), "escaped \\[x")
        XCTAssertEqual(MarkdownBlockParser.stableTail(""), "")
        XCTAssertEqual(MarkdownBlockParser.stableTail(String(repeating: "[a] ", count: 20_000)),
                       String(repeating: "[a] ", count: 20_000))
    }

    func testIncompleteTailOnlyTouchesTheLastBlock() {
        let text = "Para [one](verse:JHN.1\n\nSee [John 3:16](verse:JHN.3"
        assertBlocks(text, [(.paragraph, "Para [one](verse:JHN.1"), (.paragraph, "See John 3:16")],
                     incompleteTail: true)
        assertBlocks(text, [(.paragraph, "Para [one](verse:JHN.1"), (.paragraph, "See [John 3:16](verse:JHN.3")],
                     incompleteTail: false)
        assertBlocks("- item [John 3:1", [(.bullet(depth: 0), "item John 3:1")], incompleteTail: true)
        assertBlocks("```\n[a](b", [(.code(language: nil), "[a](b")], incompleteTail: true)
    }

    func testParsingDoesNotChangeTheSource() {
        let text = "See [John 3:16](verse:JHN.3"
        _ = MarkdownBlockParser.blocks(text, incompleteTail: true)
        XCTAssertEqual(text, "See [John 3:16](verse:JHN.3")
    }

    func testLargeInputStaysLinear() {
        let text = String(repeating: "- item [a](b) with `code`\n", count: 50_000)
        XCTAssertEqual(MarkdownBlockParser.blocks(text, incompleteTail: true).count, 50_000)
    }
}
