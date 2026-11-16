import Foundation

/// One block of an answer. Inline syntax (links, emphasis, code spans) stays
/// in `text` for the view's inline Markdown renderer.
public struct MarkdownBlock: Equatable, Identifiable, Sendable {
    public enum Kind: Equatable, Sendable {
        case paragraph
        case heading(level: Int)                 // 1...6
        case bullet(depth: Int)                  // 0...3
        case ordered(number: Int, depth: Int)    // number as written
        case quote
        case code(language: String?)
        case rule
    }
    /// Position in the parsed answer, stable while earlier blocks are unchanged.
    public let id: Int
    public let kind: Kind
    /// Inline-markdown source; raw lines (joined by "\n") for `.code`.
    public let text: String

    public init(id: Int, kind: Kind, text: String) {
        self.id = id; self.kind = kind; self.text = text
    }
}

/// Pure, linear block parser for model answers. It never mutates the stored
/// text; `incompleteTail` only changes the returned blocks. Setext headings,
/// tables, HTML and indented code blocks are out of scope (read as text).
public enum MarkdownBlockParser {
    static let maxListDepth = 3

    public static func blocks(_ markdown: String, incompleteTail: Bool = false) -> [MarkdownBlock] {
        var builder = Builder()
        for line in lines(markdown) { builder.consume(line) }
        builder.finish()
        var parts = builder.parts
        // Unfinished answers: hide syntax that is still arriving in the last
        // block, unless that block is code (its text is shown verbatim).
        if incompleteTail, let last = parts.indices.last {
            if case .code = parts[last].kind {} else {
                parts[last].text = stableTail(parts[last].text)
            }
        }
        return parts.enumerated().map { MarkdownBlock(id: $0.offset, kind: $0.element.kind, text: $0.element.text) }
    }

    /// Removes an unfinished trailing link so streaming text does not flash
    /// raw syntax: `…[John 3:16](verse:JHN.3` -> `…John 3:16`,
    /// `…[John 3:1` -> `…John 3:1`. Complete links are left unchanged.
    public static func stableTail(_ inline: String) -> String {
        let s = Array(inline.unicodeScalars)
        let n = s.count
        var close = -1                  // cached index of the next "]"
        var destinations: [Int: Int] = [:] // "]" index -> index after its ")"
        var i = 0
        while i < n {
            let c = s[i]
            if c == "\\" { i += 2; continue }
            if c == "`" {
                // Skip a complete code span; an open one is left as typed.
                var j = i + 1
                while j < n, s[j] != "`" { j += 1 }
                i = j < n ? j + 1 : n
                continue
            }
            guard c == "[" else { i += 1; continue }
            if close <= i {
                close = i + 1
                while close < n, s[close] != "]" { close += 1 }
            }
            // No "]" ahead: an unfinished label runs to the end.
            guard close < n else { return unwrap(s, from: i, labelEnd: n) }
            let j = close
            // "[label]" at the very end: a destination may still arrive.
            guard j + 1 < n else { return unwrap(s, from: i, labelEnd: j) }
            guard s[j + 1] == "(" else { i += 1; continue }
            let end: Int?
            if let cached = destinations[j] {
                end = cached
            } else {
                var k = j + 2, depth = 0
                var found: Int?
                while k < n {
                    if s[k] == "(" { depth += 1 }
                    if s[k] == ")" {
                        if depth == 0 { found = k + 1; break }
                        depth -= 1
                    }
                    k += 1
                }
                end = found
                if let found { destinations[j] = found }
            }
            guard let end else { return unwrap(s, from: i, labelEnd: j) }
            i = end
        }
        return inline
    }

    /// Text before the "[" at `from`, then the label up to `labelEnd` with any
    /// further "[" dropped (they are unclosed too).
    private static func unwrap(_ s: [Unicode.Scalar], from: Int, labelEnd: Int) -> String {
        var view = String.UnicodeScalarView()
        view.append(contentsOf: s[..<from])
        for c in s[(from + 1)..<labelEnd] where c != "[" { view.append(c) }
        return String(view)
    }

    // MARK: Lines

    /// Splits on "\r\n", "\n" and a lone "\r".
    static func lines(_ text: String) -> [String] {
        var out: [String] = []
        var current = String.UnicodeScalarView()
        var previousCR = false
        for c in text.unicodeScalars {
            if c == "\n" {
                if !previousCR { out.append(String(current)); current = String.UnicodeScalarView() }
                previousCR = false
            } else if c == "\r" {
                out.append(String(current)); current = String.UnicodeScalarView()
                previousCR = true
            } else {
                current.append(c)
                previousCR = false
            }
        }
        out.append(String(current))
        return out
    }

    // MARK: Builder

    struct Part { var kind: MarkdownBlock.Kind; var text: String }

    enum Open { case none, paragraph, quote, item }

    struct Fence { let marker: Unicode.Scalar; let length: Int; let language: String?; var lines: [String] }

    struct Builder {
        var parts: [Part] = []
        var open = Open.none
        var buffer: [String] = []
        var itemKind = MarkdownBlock.Kind.paragraph
        var fence: Fence?
        /// Backtick runs per length in the open block, so a "```" line can
        /// close an inline code span instead of opening a fence (as `MarkdownCode`).
        var runCounts: [Int: Int] = [:]

        mutating func consume(_ line: String) {
            if var current = fence {
                if closes(current, line) {
                    parts.append(Part(kind: .code(language: current.language), text: current.lines.joined(separator: "\n")))
                    fence = nil
                } else {
                    current.lines.append(line)
                    fence = current
                }
                return
            }

            let scalars = Array(line.unicodeScalars)
            var indent = 0, start = 0
            while start < scalars.count, scalars[start] == " " || scalars[start] == "\t" {
                indent += scalars[start] == "\t" ? 4 : 1
                start += 1
            }
            let body = Array(scalars[start...])
            if body.allSatisfy({ $0.properties.isWhitespace }) { flush(); return }

            if let opened = fenceOpen(body) {
                // "Example ```\n…\n```": the line closes the inline code span.
                if opened.marker == "`", open != .none, (runCounts[opened.length] ?? 0) % 2 == 1 {
                    append(string(body).trimmingCharacters(in: .whitespaces))
                    return
                }
                flush(); fence = opened; return
            }
            if let found = heading(body) {
                flush()
                parts.append(Part(kind: .heading(level: found.level), text: found.text))
                return
            }
            if isRule(body) { flush(); parts.append(Part(kind: .rule, text: "")); return }
            if body[0] == ">" {
                let text = quoteText(body)
                if open != .quote { flush() }
                if text.isEmpty {
                    // ">" alone separates quoted paragraphs.
                    flush()
                } else {
                    open = .quote
                    append(text)
                }
                return
            }
            let depth = min(indent / 2, MarkdownBlockParser.maxListDepth)
            if let text = bulletText(body) { startItemOrFence(.bullet(depth: depth), text); return }
            if let item = orderedItem(body) {
                startItemOrFence(.ordered(number: item.number, depth: depth), item.text)
                return
            }

            let text = string(body).trimmingCharacters(in: .whitespaces)
            switch open {
            case .item, .paragraph:
                // Continuation: a plain line right after a list item joins it.
                append(text)
            case .quote:
                flush(); open = .paragraph; append(text)
            case .none:
                open = .paragraph; append(text)
            }
        }

        mutating func append(_ text: String) {
            buffer.append(text)
            var length = 0
            for c in text.unicodeScalars {
                if c == "`" { length += 1; continue }
                if length > 0 { runCounts[length, default: 0] += 1; length = 0 }
            }
            if length > 0 { runCounts[length, default: 0] += 1 }
        }

        /// "1. ```" / "- ```": the item's content is a fenced code block.
        mutating func startItemOrFence(_ kind: MarkdownBlock.Kind, _ text: String) {
            if let opened = fenceOpen(Array(text.unicodeScalars)) {
                startItem(kind, "")
                flush()
                fence = opened
                return
            }
            startItem(kind, text)
        }

        mutating func finish() {
            if let current = fence {
                // Unterminated fence: code to the end.
                parts.append(Part(kind: .code(language: current.language), text: current.lines.joined(separator: "\n")))
                fence = nil
            }
            flush()
        }

        mutating func startItem(_ kind: MarkdownBlock.Kind, _ text: String) {
            flush()
            open = .item
            itemKind = kind
            append(text)
        }

        mutating func flush() {
            switch open {
            case .none: break
            case .paragraph: parts.append(Part(kind: .paragraph, text: joined()))
            case .quote: parts.append(Part(kind: .quote, text: joined()))
            case .item: parts.append(Part(kind: itemKind, text: joined()))
            }
            open = .none
            buffer = []
            runCounts.removeAll(keepingCapacity: true)
        }

        func joined() -> String { buffer.filter { !$0.isEmpty }.joined(separator: " ") }

        // MARK: Line kinds

        func string(_ scalars: ArraySlice<Unicode.Scalar>) -> String {
            var view = String.UnicodeScalarView()
            view.append(contentsOf: scalars)
            return String(view)
        }
        func string(_ scalars: [Unicode.Scalar]) -> String { string(scalars[...]) }

        /// ``` or ~~~ (3 or more), language from the rest of the line.
        func fenceOpen(_ body: [Unicode.Scalar]) -> Fence? {
            guard let marker = body.first, marker == "`" || marker == "~" else { return nil }
            var length = 0
            while length < body.count, body[length] == marker { length += 1 }
            guard length >= 3 else { return nil }
            let info = string(body[length...]).trimmingCharacters(in: .whitespaces)
            // "```code```" on one line is inline code, not a fence.
            if marker == "`", info.contains("`") { return nil }
            let language = info.split(whereSeparator: { $0.isWhitespace }).first.map(String.init)
            return Fence(marker: marker, length: length, language: language, lines: [])
        }

        func closes(_ fence: Fence, _ line: String) -> Bool {
            let body = Array(line.unicodeScalars.drop(while: { $0 == " " || $0 == "\t" }))
            var length = 0
            while length < body.count, body[length] == fence.marker { length += 1 }
            guard length >= fence.length else { return false }
            return body[length...].allSatisfy { $0.properties.isWhitespace }
        }

        /// 1–6 "#" then a space or the end of the line; a closing "#" run is stripped.
        func heading(_ body: [Unicode.Scalar]) -> (level: Int, text: String)? {
            var level = 0
            while level < body.count, body[level] == "#" { level += 1 }
            guard (1...6).contains(level) else { return nil }
            guard level == body.count || body[level] == " " || body[level] == "\t" else { return nil }
            var content = Array(body[level...])
            while let last = content.last, last == " " || last == "\t" { content.removeLast() }
            var end = content.count
            while end > 0, content[end - 1] == "#" { end -= 1 }
            if end < content.count, end == 0 || content[end - 1] == " " || content[end - 1] == "\t" {
                content.removeSubrange(end...)
            }
            return (level, string(content).trimmingCharacters(in: .whitespaces))
        }

        /// Only "-", "*" or "_" (3 or more of one), spaces allowed between.
        func isRule(_ body: [Unicode.Scalar]) -> Bool {
            guard let marker = body.first, marker == "-" || marker == "*" || marker == "_" else { return false }
            var count = 0
            for c in body {
                if c == marker { count += 1 } else if c != " " && c != "\t" { return false }
            }
            return count >= 3
        }

        /// ">" markers (nested ones flattened), each with an optional space.
        func quoteText(_ body: [Unicode.Scalar]) -> String {
            var i = 0
            while i < body.count, body[i] == ">" {
                i += 1
                if i < body.count, body[i] == " " || body[i] == "\t" { i += 1 }
                while i < body.count, body[i] == " ", i + 1 < body.count, body[i + 1] == ">" { i += 1 }
            }
            return string(body[i...]).trimmingCharacters(in: .whitespaces)
        }

        /// "-", "*" or "+" then a space ("**bold**" is not a bullet).
        func bulletText(_ body: [Unicode.Scalar]) -> String? {
            guard body.count >= 2, body[0] == "-" || body[0] == "*" || body[0] == "+",
                  body[1] == " " || body[1] == "\t" else { return nil }
            return string(body[2...]).trimmingCharacters(in: .whitespaces)
        }

        /// 1–9 digits, "." or ")", then a space ("1.5 million" is text).
        func orderedItem(_ body: [Unicode.Scalar]) -> (number: Int, text: String)? {
            var digits = 0
            while digits < body.count, digits < 10, body[digits].value >= 48, body[digits].value <= 57 { digits += 1 }
            guard (1...9).contains(digits), digits + 1 < body.count,
                  body[digits] == "." || body[digits] == ")",
                  body[digits + 1] == " " || body[digits + 1] == "\t",
                  let number = Int(string(body[..<digits])) else { return nil }
            return (number, string(body[(digits + 2)...]).trimmingCharacters(in: .whitespaces))
        }
    }
}
