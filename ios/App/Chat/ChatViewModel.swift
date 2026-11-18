import Foundation
import Observation
import ShalomCore

/// Narrow injection boundary: native tests can drive SSE without a real server.
protocol ChatStreamingAPI: Sendable {
    func streamChat(_ request: ChatRequest) async throws -> AsyncThrowingStream<AgentEvent, Error>
}
extension ShalomAPIClient: ChatStreamingAPI {}

/// One visible conversation. Generation checks prevent a delayed response from a
/// stopped turn or a previous account being applied to the next conversation.
@MainActor @Observable
final class ChatViewModel {
    private(set) var thread = ChatThread()
    var draft = ""
    private(set) var isStreaming = false
    private(set) var isReadOnlyOffline = false
    private(set) var errorMessage: String?
    private(set) var cooldownSeconds = 0
    private(set) var completedTurnRevision = 0
    /// User/navigation actions, separate from streamed text updates.
    private(set) var interactionRevision = 0
    let consent: AIConsentStore
    private(set) var isConsentPresented = false
    private(set) var isDeletingLocalHistory = false

    @ObservationIgnored private let api: any ChatStreamingAPI
    @ObservationIgnored private let cache: ChatCache
    @ObservationIgnored private var scope: ChatCacheScope
    @ObservationIgnored private var streamTask: Task<Void, Never>?
    @ObservationIgnored private var cooldownTask: Task<Void, Never>?
    @ObservationIgnored private var stoppedSaves: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var invalidationTasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var historyDeletionRevision = 0

    init(api: any ChatStreamingAPI, cache: ChatCache, scope: ChatCacheScope,
         consent: AIConsentStore? = nil) {
        self.api = api; self.cache = cache; self.scope = scope
        self.consent = consent ?? AIConsentStore(scope: scope)
    }

    func allowAISharing() {
        consent.grant()
        if consent.isAllowed { isConsentPresented = false }
    }

    func dismissConsent() { isConsentPresented = false }

    func revokeAISharing() {
        consent.revoke()
        isConsentPresented = false
        stop()
    }

    var messages: [ChatMessage] { thread.messages }
    var canSend: Bool {
        !isStreaming && !isDeletingLocalHistory && !isReadOnlyOffline && cooldownSeconds == 0
            && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func newChat() {
        guard !isDeletingLocalHistory else { return }
        isConsentPresented = false
        interactionRevision += 1
        stop()
        generation = UUID()
        thread = ChatThread()
        draft = ""
        errorMessage = nil
        isReadOnlyOffline = false
    }

    func open(_ value: ChatThread, offline: Bool = false) {
        guard !isDeletingLocalHistory else { return }
        isConsentPresented = false
        interactionRevision += 1
        stop()
        generation = UUID()
        thread = value
        draft = ""
        errorMessage = nil
        isReadOnlyOffline = offline
    }

    func changeScope(_ value: ChatCacheScope) {
        stop()
        generation = UUID()
        scope = value
        consent.changeScope(value)
        isConsentPresented = false
        thread = ChatThread()
        draft = ""
        errorMessage = nil
        isReadOnlyOffline = false
    }

    /// A suggestion or card may call this only after an explicit in-app tap.
    /// Deep links set `draft` instead and never call send.
    func send(_ suppliedText: String? = nil) {
        guard !isStreaming, !isDeletingLocalHistory, !isReadOnlyOffline, cooldownSeconds == 0 else { return }
        let text = (suppliedText ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard text.utf16.count <= 8_000 else {
            errorMessage = "That question is too long. Keep it under 8,000 characters."
            return
        }
        consent.reload()
        guard consent.isAllowed else {
            draft = text
            isConsentPresented = true
            return
        }
        isConsentPresented = false
        interactionRevision += 1
        let history = HistoryPolicy.forMessages(thread.messages)
        let user = ChatMessage(role: .user, text: text)
        let assistant = ChatMessage(role: .assistant, delivery: .streaming)
        if thread.messages.isEmpty {
            thread.title = String(text.replacingOccurrences(of: "\n", with: " ").prefix(60))
        }
        thread.messages.append(contentsOf: [user, assistant])
        thread.updatedAt = ISO8601DateFormatter().string(from: Date())
        draft = ""
        errorMessage = nil
        isStreaming = true
        let request = ChatRequest(message: text, chatId: thread.id, history: history)
        let ticket = UUID()
        generation = ticket
        let chatID = thread.id
        let targetScope = scope

        streamTask = Task { [weak self] in
            guard let self else { return }
            var finished = false
            do {
                try Task.checkCancellation()
                guard generation == ticket, consent.isAllowed else { return }
                let events = try await api.streamChat(request)
                for try await event in events {
                    try Task.checkCancellation()
                    guard generation == ticket, thread.id == chatID else { return }
                    if let position = thread.messages.firstIndex(where: { $0.id == assistant.id }) {
                        ChatReducer.apply(event, to: &thread.messages[position])
                    }
                    switch event {
                    case .done:
                        finished = true
                    case .error:
                        // The reducer renders the error on this message. Do
                        // not duplicate it as a second global warning.
                        finished = true
                    default: break
                    }
                }
                guard generation == ticket, thread.id == chatID else { return }
                if !finished {
                    finishMessage(assistant.id, .incomplete)
                    errorMessage = "The connection ended before the answer finished. The partial answer is kept here."
                }
            } catch is CancellationError {
                guard generation == ticket, thread.id == chatID else { return }
                finishMessage(assistant.id, .stopped)
            } catch {
                guard generation == ticket, thread.id == chatID else { return }
                if Task.isCancelled {
                    finishMessage(assistant.id, .stopped)
                } else {
                    finishMessage(assistant.id, ChatReducer.streamEnd(for: error))
                    if let problem = error as? ShalomAPIError,
                       problem.statusCode == 429, let seconds = problem.retryAfter {
                        beginCooldown(seconds)
                    }
                }
            }
            guard generation == ticket, thread.id == chatID else { return }
            isStreaming = false
            thread.updatedAt = ISO8601DateFormatter().string(from: Date())
            let write = persistLocally(thread, scope: targetScope, ticket: ticket)
            await write.value
            guard generation == ticket else { return }
            streamTask = nil
            completedTurnRevision += 1
        }
    }

    func stop() {
        guard isStreaming else { return }
        interactionRevision += 1
        streamTask?.cancel()
        streamTask = nil
        generation = UUID()
        if let last = thread.messages.last, last.role == .assistant {
            finishMessage(last.id, .stopped)
        }
        isStreaming = false
        let snapshot = thread
        let targetScope = scope
        // A local stopped draft is useful, but it is not a verified final
        // answer and is not claimed to have been saved by the server.
        _ = persistLocally(snapshot, scope: targetScope, ticket: generation)
    }

    func stopForBackground() {
        guard isStreaming || !stoppedSaves.isEmpty else { return }
        let lease = BackgroundWriteLease()
        stop()
        let writes = Array(stoppedSaves.values)
        Task {
            for write in writes { await write.value }
            lease.end()
        }
    }

    private func persistLocally(_ snapshot: ChatThread, scope: ChatCacheScope, ticket: UUID) -> Task<Void, Never> {
        let saveID = UUID()
        let task = Task { [weak self, cache] in
            do {
                try Task.checkCancellation()
                try await cache.saveThread(snapshot, scope: scope)
            } catch {
                if !Task.isCancelled, self?.generation == ticket {
                    self?.errorMessage = self?.errorMessage ?? "This conversation could not be kept on this device."
                }
            }
            self?.stoppedSaves[saveID] = nil
        }
        stoppedSaves[saveID] = task
        return task
    }

    /// Drain old writes before the caller clears a private cache. Cancellation
    /// alone cannot undo an atomic write that already began on the cache actor.
    func invalidateForAccountChange(preservingDraft: Bool = false) async {
        var guestDraft = preservingDraft && !isDeletingLocalHistory && !thread.messages.isEmpty ? thread : nil
        let previousScope = scope
        let deletionRevision = historyDeletionRevision
        let earlierInvalidations = Array(invalidationTasks.values)
        if var value = guestDraft, let last = value.messages.indices.last,
           value.messages[last].role == .assistant {
            ChatReducer.end(&value.messages[last], .stopped)
            guestDraft = value
        }
        let previousStream = streamTask
        let pendingSaves = Array(stoppedSaves.values)
        interactionRevision += 1
        generation = UUID()
        previousStream?.cancel()
        streamTask = nil
        for task in pendingSaves { task.cancel() }
        stoppedSaves.removeAll()
        cooldownTask?.cancel()
        cooldownTask = nil
        cooldownSeconds = 0
        isStreaming = false
        isConsentPresented = false
        thread = ChatThread()
        draft = ""
        errorMessage = nil
        isReadOnlyOffline = false
        let id = UUID()
        let work = Task { [weak self, cache] in
            for task in earlierInvalidations { await task.value }
            await previousStream?.value
            for task in pendingSaves { await task.value }
            if let guestDraft, self?.historyDeletionRevision == deletionRevision {
                try? await cache.saveThread(guestDraft, scope: previousScope)
            }
        }
        invalidationTasks[id] = work
        await work.value
        invalidationTasks[id] = nil
    }

    @discardableResult
    func deleteGuestHistory() async throws -> Bool {
        guard scope.userID == nil, !isDeletingLocalHistory else { return false }
        isDeletingLocalHistory = true
        historyDeletionRevision += 1
        let targetScope = scope
        defer { isDeletingLocalHistory = false }
        await invalidateForAccountChange()
        try await cache.clear(scope: targetScope)
        return true
    }

    private func finishMessage(_ id: String, _ ending: ChatReducer.StreamEnd) {
        guard let p = thread.messages.firstIndex(where: { $0.id == id }) else { return }
        // This is a no-op after done, so a last-moment Stop cannot downgrade
        // an already completed/checked reply. It also settles tool spinners.
        ChatReducer.end(&thread.messages[p], ending)
    }

    private func beginCooldown(_ delay: TimeInterval) {
        cooldownTask?.cancel()
        let bounded = min(max(delay, 1), 86_400)
        let deadline = Date().addingTimeInterval(bounded)
        cooldownSeconds = Int(ceil(bounded))
        cooldownTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                cooldownSeconds = max(0, Int(ceil(deadline.timeIntervalSinceNow)))
                if cooldownSeconds == 0 { break }
                do { try await Task.sleep(for: .seconds(1)) }
                catch { return }
            }
        }
    }
}
