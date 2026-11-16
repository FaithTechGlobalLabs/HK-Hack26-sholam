#if DEBUG
import Foundation
import ShalomCore

/// DEBUG-only scripted chat transport for UI tests. It never opens a network
/// connection: every event is synthetic and labelled as test data.
///
/// Selected with `--ui-testing --ui-chat-fixture=<verified|unverified|formatted|legacy|scrolling|hold|error>`.
/// In UI-test mode without a (known) fixture the app uses `.refusal`, which
/// answers with an error and contacts nothing.
///
/// Verse text below is BSB, copied from the repository's own fixtures
/// (`src/lib/agent/demo.ts` for John 14:27, `tests/citations.test.ts` for
/// Exodus 3:6–7 and John 11:35). It is test data, not a lookup.
actor UITestChatAPI: ChatStreamingAPI {
    enum Fixture: String, Sendable {
        /// Tool call, fetched verses (incl. a two-verse range), cited text,
        /// a clean final check and `done`.
        case verified
        /// A cite that was never fetched; the final check reports it.
        case unverified
        case formatted
        case legacy
        case scrolling
        /// A partial answer that stays open until the consumer cancels.
        case hold
        /// One error event, then the stream ends.
        case error
        /// Default in UI-test mode: refuses without any transport.
        case refusal
    }

    static let argumentPrefix = "--ui-chat-fixture="

    let fixture: Fixture
    /// Open scripted streams. A cancelled `hold` removes itself here.
    private var producers: [UUID: Task<Void, Never>] = [:]
    private(set) var requestCount = 0

    init(fixture: Fixture) { self.fixture = fixture }

    /// The fixture named by the launch arguments, or `.refusal`.
    static func fixture(from arguments: [String]) -> Fixture {
        guard let argument = arguments.last(where: { $0.hasPrefix(argumentPrefix) }),
              let value = Fixture(rawValue: String(argument.dropFirst(argumentPrefix.count))),
              value != .refusal
        else { return .refusal }
        return value
    }

    func streamChat(_ request: ChatRequest) async throws -> AsyncThrowingStream<AgentEvent, Error> {
        requestCount += 1
        let id = UUID()
        let steps = Self.script(for: fixture)
        let (stream, continuation) = AsyncThrowingStream<AgentEvent, Error>.makeStream()
        // Actor-isolated: the body cannot start before this method returns,
        // so registration and `onTermination` are in place first.
        let producer = Task {
            do {
                for step in steps {
                    try Task.checkCancellation()
                    switch step {
                    case .event(let event):
                        continuation.yield(event)
                    case .pause(let delay):
                        try await Task.sleep(for: delay)
                    case .holdUntilCancelled:
                        while true { try await Task.sleep(for: .seconds(60)) }
                    case .appendUntilCancelled:
                        for index in 1...200 {
                            try Task.checkCancellation()
                            continuation.yield(.textDelta(" Stream marker \(index)."))
                            try await Task.sleep(for: .milliseconds(250))
                        }
                        while true { try await Task.sleep(for: .seconds(60)) }
                    }
                }
                continuation.finish()
            } catch {
                let failure: any Error = Task.isCancelled ? CancellationError() : error
                continuation.finish(throwing: failure)
            }
            self.drop(id)
        }
        producers[id] = producer
        continuation.onTermination = { _ in
            // Consumer stopped (Stop, new chat, account change): end the script.
            producer.cancel()
        }
        return stream
    }

    private func drop(_ id: UUID) { producers[id] = nil }

    // MARK: - Scripts

    private enum Step: Sendable {
        case event(AgentEvent)
        case pause(Duration)
        case holdUntilCancelled
        case appendUntilCancelled
    }

    private static let toolID = "ui-fixture-tool-1"

    static let exodus36 = VerseRecord(
        id: "EXO.3.6", label: "Exodus 3:6",
        text: "Then He said, “I am the God of your father, the God of Abraham, the God of Isaac, and the God of Jacob.” At this, Moses hid his face, for he was afraid to look at God."
    )
    static let exodus37 = VerseRecord(
        id: "EXO.3.7", label: "Exodus 3:7",
        text: "The LORD said, “I have indeed seen the affliction of My people in Egypt. I have heard them crying out because of their oppressors, and I am aware of their sufferings."
    )
    static let john1427 = VerseRecord(
        id: "JHN.14.27", label: "John 14:27",
        text: "Peace I leave with you; My peace I give to you. I do not give to you as the world gives. Do not let your hearts be troubled; do not be afraid."
    )
    static let john1135 = VerseRecord(id: "JHN.11.35", label: "John 11:35", text: "Jesus wept.")

    static let verifiedAnswer = """
    Synthetic UI test answer (fixture data, not a model reply).

    God tells Moses who He is and that He has seen His people suffer [Exodus 3:6–7](verse:EXO.3.6). Jesus gives His own peace [John 14:27](verse:JHN.14.27).
    """

    static let unverifiedAnswer = """
    Synthetic UI test answer (fixture data, not a model reply).

    Jesus grieved with His friends [John 11:35](verse:JHN.11.35). This fixture also cites a passage it never looked up [Psalm 23:1](verse:PSA.23.1).
    """

    static let formattedAnswer = """
    # A readable answer

    Synthetic formatting fixture, not a model reply. This paragraph stays separate from the numbered steps.

    3. First numbered step keeps its original marker.
    4. Second numbered step remains a separate item.
      - Nested bullet stays with the list.
    + A plus-sign bullet is also supported.

    > This is quoted fixture text, not Scripture.

    ```text
    sample code preserves
      its indentation
    ```

    The existing lookup fixture provides [Exodus 3:6–7](verse:EXO.3.6).
    """

    static let legacyAnswer = """
    Synthetic legacy-reference fixture, not a model reply.

    This older response names Exodus 3:6–7 and Psalm 23:1 as plain text. Its old final event does not prove those mentions were checked.
    """

    static let scrollingAnswer = "Scroll history begins here. Synthetic scrolling fixture, not a model reply.\n\n" +
        (1...18).map { index in
            "Paragraph \(index). This is synthetic layout text for checking reading position. Scroll away from the end while new text arrives, then manually return to the bottom. No network or model is used."
        }.joined(separator: "\n\n")

    static let holdPartial = "Synthetic hold fixture: this partial answer stays open until Stop is pressed."
    static let errorMessage = "Synthetic UI test error: this scripted fixture failed on purpose."
    static let refusalMessage = "UI test mode has no chat transport. No request was sent."

    private static func lookup(_ verses: [VerseRecord]) -> [Step] {
        [
            .pause(.milliseconds(300)),
            .event(.toolStart(id: toolID, name: "lookup_verses",
                              input: .object(["references": .array(verses.map { .string($0.label) })]))),
            .pause(.milliseconds(400)),
            .event(.verses(verses)),
            .event(.toolResult(id: toolID, name: "lookup_verses", ok: true,
                               summary: "\(verses.count) verses (test fixture)")),
        ]
    }

    private static func typed(_ text: String) -> [Step] {
        text.split(separator: " ", omittingEmptySubsequences: false).enumerated().flatMap { index, word in
            [Step.event(.textDelta((index == 0 ? "" : " ") + word)), .pause(.milliseconds(30))]
        }
    }

    private static func script(for fixture: Fixture) -> [Step] {
        switch fixture {
        case .verified:
            return lookup([exodus36, exodus37, john1427]) + typed(verifiedAnswer) + [
                .pause(.milliseconds(200)),
                .event(.citations(unverified: [], quoteWarnings: [])),
                .event(.done(stopReason: "end_turn", messageId: nil, saved: false)),
            ]
        case .unverified:
            return lookup([john1135]) + typed(unverifiedAnswer) + [
                .pause(.milliseconds(200)),
                .event(.citations(
                    unverified: [CitationIssue(verseId: "PSA.23.1", label: "Psalm 23:1", reason: .notFetched)],
                    quoteWarnings: []
                )),
                .event(.done(stopReason: "end_turn", messageId: nil, saved: false)),
            ]
        case .formatted:
            return lookup([exodus36, exodus37]) + typed(formattedAnswer) + [
                .event(.citations(unverified: [], quoteWarnings: [])),
                .event(.done(stopReason: "end_turn", messageId: nil, saved: false)),
            ]
        case .legacy:
            return lookup([exodus36, exodus37]) + typed(legacyAnswer) + [
                .event(.citations(unverified: [], quoteWarnings: [])),
                .event(.done(stopReason: "end_turn", messageId: nil, saved: false)),
            ]
        case .scrolling:
            return [.event(.textDelta(scrollingAnswer)), .pause(.milliseconds(400)), .appendUntilCancelled]
        case .hold:
            return [.pause(.milliseconds(300))] + typed(holdPartial) + [.holdUntilCancelled]
        case .error:
            return [.pause(.milliseconds(300)), .event(.error(errorMessage))]
        case .refusal:
            return [.event(.error(refusalMessage))]
        }
    }
}
#endif
