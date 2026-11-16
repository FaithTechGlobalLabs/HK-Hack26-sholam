import Foundation

/// One dispatched server-sent event: its `event:` name (default `message`)
/// and its `data:` lines joined with "\n".
public struct SSEFrame: Equatable, Sendable {
    public var event: String
    public var data: String
    public init(event: String, data: String) {
        self.event = event; self.data = data
    }
}

public enum SSEParserError: Error, Equatable, Sendable {
    /// A line or a frame's data exceeded `maxFrameBytes`.
    case frameTooLarge
}

/// Incremental, byte-level SSE parser (WHATWG event-stream rules).
///
/// Works on raw bytes so a multi-byte UTF-8 character or a CRLF pair split
/// across network chunks is reassembled before decoding: UTF-8 continuation
/// bytes never equal CR or LF, so a line is only decoded once complete.
/// Comments (`:`), `id:` and `retry:` lines are ignored. Lines and the data
/// of one frame are bounded by `maxFrameBytes`.
public struct SSEParser: Sendable {
    public static let defaultMaxFrameBytes = 1 << 20

    public let maxFrameBytes: Int
    private var line: [UInt8] = []
    private var eventName: String?
    private var data: String = ""
    private var dataBytes = 0
    private var hasData = false
    private var pendingCR = false
    private var isFirstLine = true

    public init(maxFrameBytes: Int = SSEParser.defaultMaxFrameBytes) {
        self.maxFrameBytes = max(64, maxFrameBytes)
    }

    /// Feeds one byte; returns a frame when a blank line dispatches one.
    public mutating func push(byte: UInt8) throws -> SSEFrame? {
        if pendingCR {
            pendingCR = false
            // Second half of a CRLF pair (possibly from the next chunk).
            if byte == 0x0A { return nil }
        }
        switch byte {
        case 0x0D:
            pendingCR = true
            return try endLine()
        case 0x0A:
            return try endLine()
        default:
            line.append(byte)
            if line.count > maxFrameBytes { throw SSEParserError.frameTooLarge }
            return nil
        }
    }

    /// Feeds a chunk; returns every frame it completed, in order.
    public mutating func push<S: Sequence>(_ bytes: S) throws -> [SSEFrame] where S.Element == UInt8 {
        var frames: [SSEFrame] = []
        for byte in bytes {
            if let frame = try push(byte: byte) { frames.append(frame) }
        }
        return frames
    }

    /// Ends the stream. An unterminated frame is discarded (never dispatched);
    /// returns true when one was pending, so callers can report incomplete EOF.
    @discardableResult
    public mutating func finish() -> Bool {
        let partial = !line.isEmpty || hasData || eventName != nil
        line.removeAll(keepingCapacity: false)
        resetFrame()
        pendingCR = false
        return partial
    }

    private mutating func resetFrame() {
        eventName = nil
        data = ""
        dataBytes = 0
        hasData = false
    }

    private mutating func endLine() throws -> SSEFrame? {
        var bytes = line
        line.removeAll(keepingCapacity: true)
        if isFirstLine {
            isFirstLine = false
            if bytes.starts(with: [0xEF, 0xBB, 0xBF]) { bytes.removeFirst(3) }
        }
        if bytes.isEmpty {
            defer { resetFrame() }
            guard hasData else { return nil }
            return SSEFrame(event: eventName ?? "message", data: data)
        }
        if bytes.first == UInt8(ascii: ":") { return nil } // comment / keep-alive

        let field: String
        var value: String
        if let colon = bytes.firstIndex(of: UInt8(ascii: ":")) {
            field = String(decoding: bytes[..<colon], as: UTF8.self)
            var start = colon + 1
            if start < bytes.endIndex, bytes[start] == UInt8(ascii: " ") { start += 1 }
            value = String(decoding: bytes[start...], as: UTF8.self)
        } else {
            field = String(decoding: bytes, as: UTF8.self)
            value = ""
        }
        switch field {
        case "event":
            value = value.trimmingCharacters(in: .whitespaces)
            eventName = value
        case "data":
            dataBytes += value.utf8.count + (hasData ? 1 : 0)
            if dataBytes > maxFrameBytes { throw SSEParserError.frameTooLarge }
            data = hasData ? data + "\n" + value : value
            hasData = true
        default:
            break // id, retry and unknown fields carry nothing for this app
        }
        return nil
    }
}

/// SSE bytes -> typed `AgentEvent`s. Unknown event names and frames whose
/// payload fails validation are dropped (counted), matching the web's
/// `SseDecoder`, so one bad frame cannot end the stream or fake success.
public struct AgentEventDecoder: Sendable {
    private var parser: SSEParser
    public private(set) var droppedFrames = 0
    public private(set) var unknownFrames = 0

    public init(maxFrameBytes: Int = SSEParser.defaultMaxFrameBytes) {
        parser = SSEParser(maxFrameBytes: maxFrameBytes)
    }

    public mutating func push(byte: UInt8) throws -> AgentEvent? {
        guard let frame = try parser.push(byte: byte) else { return nil }
        return decode(frame)
    }

    public mutating func push<S: Sequence>(_ bytes: S) throws -> [AgentEvent] where S.Element == UInt8 {
        try parser.push(bytes).compactMap { decode($0) }
    }

    /// True when the stream ended inside an unterminated frame.
    @discardableResult
    public mutating func finish() -> Bool { parser.finish() }

    private mutating func decode(_ frame: SSEFrame) -> AgentEvent? {
        do {
            guard let event = try AgentEvent.decode(name: frame.event, data: Data(frame.data.utf8)) else {
                unknownFrames += 1
                return nil
            }
            return event
        } catch {
            droppedFrames += 1
            return nil
        }
    }
}
