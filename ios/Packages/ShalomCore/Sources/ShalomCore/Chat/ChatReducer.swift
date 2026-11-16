import Foundation

/// Applies streamed `AgentEvent`s to the assistant message, mirroring
/// `applyEvent` in `src/components/shell/useChatStream.ts`, with stricter
/// evidence rules:
/// - only a final `citations` event sets `hasFinalCitationCheck`;
/// - `reset` replaces the text and clears any earlier check results;
/// - verses arriving after the final check are ignored (nothing fetched
///   after the answer counts);
/// - a `quote_mismatch` issue always wins over fetched verse text;
/// - events after `done`/`error`/stop are ignored.
public enum ChatReducer {
    /// Upper bound on streamed answer text (the model is capped far below).
    public static let maxTextLength = 200_000
    static let maxErrorLength = 500

    /// How a stream ended, for messages still marked `.streaming`.
    public enum StreamEnd: Equatable, Sendable {
        /// The stream finished normally. Without `done` this is still incomplete.
        case finished
        /// The person pressed Stop, left, or the task was cancelled.
        case stopped
        /// The connection closed before `done`.
        case incomplete
        /// The request or stream failed; the message shows this text.
        case failed(String)
    }

    /// An assistant placeholder ready to receive events.
    public static func newAssistantMessage(id: String = ChatID.make()) -> ChatMessage {
        ChatMessage(id: id, role: .assistant, delivery: .streaming)
    }

    public static func apply(_ event: AgentEvent, to message: inout ChatMessage) {
        guard message.delivery == .streaming else { return }
        switch event {
        case .textDelta(let text):
            let room = maxTextLength - message.text.utf16.count
            guard room > 0, !text.isEmpty else { return }
            message.text += text.utf16.count <= room
                ? text : HistoryPolicy.clip(text, maxUTF16: room)
            // Text after the check is not covered by it.
            message.hasFinalCitationCheck = false

        case .reset(_, let text):
            // Verses fetched earlier this turn stay: they are same-turn
            // evidence the corrective rewrite may cite. Only the provisional
            // check results go.
            message.text = HistoryPolicy.clip(text ?? "", maxUTF16: maxTextLength)
            message.unverified = [:]
            message.quoteWarnings = []
            message.hasFinalCitationCheck = false

        case .citations(let issues, let quoteWarnings):
            var unverified: [String: CitationIssueReason] = [:]
            for issue in issues {
                if unverified[issue.verseId] == .quoteMismatch { continue }
                unverified[issue.verseId] = issue.reason
            }
            message.unverified = unverified
            message.quoteWarnings = quoteWarnings
            message.hasFinalCitationCheck = true

        case .toolStart(let id, let name, _):
            guard !message.tools.contains(where: { $0.id == id }) else { return }
            message.tools.append(ToolStatus(id: id, name: name))

        case .toolResult(let id, let name, let ok, let summary):
            if let index = message.tools.firstIndex(where: { $0.id == id }) {
                message.tools[index].done = true
                message.tools[index].ok = ok
                message.tools[index].summary = summary
            } else {
                message.tools.append(ToolStatus(id: id, name: name, done: true, ok: ok, summary: summary))
            }

        case .verses(let verses):
            // Only evidence fetched before the final check may back the answer.
            guard !message.hasFinalCitationCheck else { return }
            for verse in verses { message.verses[verse.id] = verse }

        case .flashcards(let cards):
            message.cards = cards

        case .flashcardProposal(let draft):
            message.proposal = draft

        case .error(let text):
            message.error = HistoryPolicy.clip(text, maxUTF16: maxErrorLength)
            message.delivery = .failed
            // A failed turn is never presented as checked, even if a
            // citations event arrived before the failure.
            message.hasFinalCitationCheck = false
            markRunningToolsDone(&message)

        case .done:
            message.delivery = .complete
            markRunningToolsDone(&message)
        }
    }

    /// Settles a message that is still `.streaming` when its stream ends.
    public static func end(_ message: inout ChatMessage, _ end: StreamEnd) {
        guard message.delivery == .streaming else { return }
        switch end {
        case .finished, .incomplete:
            message.delivery = .incomplete
        case .stopped:
            message.delivery = .stopped
        case .failed(let text):
            message.delivery = .failed
            message.error = HistoryPolicy.clip(text, maxUTF16: maxErrorLength)
        }
        // A partial answer is never presented as checked.
        message.hasFinalCitationCheck = false
        markRunningToolsDone(&message)
    }

    /// Classifies how a stream loop ended (`nil` = it returned normally).
    public static func streamEnd(for error: (any Error)?) -> StreamEnd {
        guard let error else { return .finished }
        if error is CancellationError { return .stopped }
        if let api = error as? ShalomAPIError {
            switch api.kind {
            case .cancelled: return .stopped
            case .incompleteStream: return .incomplete
            default: return .failed(api.displayMessage)
            }
        }
        if let url = error as? URLError, url.code == .cancelled { return .stopped }
        return .failed("Something went wrong. Please try again.")
    }

    /// Convenience: `end(&message, streamEnd(for: error))`.
    public static func finish(_ message: inout ChatMessage, error: (any Error)?) {
        end(&message, streamEnd(for: error))
    }

    private static func markRunningToolsDone(_ message: inout ChatMessage) {
        for index in message.tools.indices where !message.tools[index].done {
            message.tools[index].done = true
        }
    }
}
