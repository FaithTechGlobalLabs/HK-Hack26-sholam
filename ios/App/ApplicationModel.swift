import CryptoKit
import Foundation
import Observation
import ShalomCore

@MainActor @Observable
final class ApplicationModel {
    enum Section: String, CaseIterable, Identifiable {
        case chat, flashcards, chats
        var id: String { rawValue }
        var title: String {
            switch self { case .chat: "Chat"; case .flashcards: "Flashcards"; case .chats: "Chats" }
        }
        var symbol: String {
            switch self { case .chat: "bubble.left.and.bubble.right"; case .flashcards: "square.stack"; case .chats: "clock" }
        }
    }

    let configuration: NativeConfiguration
    let auth: AuthStore
    let api: ShalomAPIClient
    let chat: ChatViewModel
    private let cache: ChatCache
    private let importLedger: GuestImportLedger
    private let requestIdentity: AccountRequestIdentity
    var section: Section = .chat
    var accountPresented = false
    var focusedCardID: String?
    private(set) var cards: [Flashcard] = []
    private(set) var deckOffline = true
    private(set) var deckRefreshing = false
    private(set) var deckNotice: String?
    private(set) var history: [ChatSummary] = []
    private(set) var historyLoading = false
    private(set) var historyNotice: String?
    private(set) var guestImportCount = 0
    private(set) var importBusy = false
    private(set) var importNotice: String?

    private var currentUserID: String?
    @ObservationIgnored private var identityGeneration = UUID()
    @ObservationIgnored private var historyRequest = UUID()
    @ObservationIgnored private var openRequest = UUID()
    @ObservationIgnored private var loadedThreads: [String: ChatThread] = [:]
    @ObservationIgnored private var pendingCacheOperations: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var knownRemoteIDs = Set<String>()
    @ObservationIgnored private var importedGuestCounts: [String: Int] = [:]
    @ObservationIgnored private let isUITesting: Bool

    /// `chatAPI` is for tests; nil keeps the real client (or, in DEBUG UI-test
    /// mode, the scripted no-network fixture).
    init(configuration: NativeConfiguration = .load(), chatAPI: (any ChatStreamingAPI)? = nil) {
        self.configuration = configuration
        #if DEBUG
        // Release builds never enter test mode, so it can never be paired
        // with the production backend.
        let isUITesting = ProcessInfo.processInfo.arguments.contains("--ui-testing")
            || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        #else
        let isUITesting = false
        #endif
        self.isUITesting = isUITesting
        let auth = AuthStore(configuration: configuration)
        self.auth = auth
        let requestIdentity = AccountRequestIdentity(auth: auth)
        self.requestIdentity = requestIdentity
        let api = ShalomAPIClient(baseURL: configuration.apiBaseURL, tokenProvider: requestIdentity)
        self.api = api
        let environmentHash = SHA256.hash(data: Data(configuration.environmentID.utf8))
            .map { String(format: "%02x", $0) }.joined()
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let directory = support.appendingPathComponent("ShalomNative", isDirectory: true)
            .appendingPathComponent(environmentHash, isDirectory: true)
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        // Clears only the hashed cache of the fake ui-tests.invalid
        // environment, before anything opens it. Never real user storage or
        // the Keychain.
        if isUITesting, arguments.contains("--ui-reset-storage"),
           configuration.apiBaseURL.host == "ui-tests.invalid" {
            try? FileManager.default.removeItem(at: directory)
        }
        // UI tests never use real transport: a scripted fixture, or a
        // refusal that sends nothing.
        let streamingAPI: any ChatStreamingAPI = chatAPI
            ?? (isUITesting
                ? UITestChatAPI(fixture: UITestChatAPI.fixture(from: arguments)) as any ChatStreamingAPI
                : api)
        #else
        let streamingAPI: any ChatStreamingAPI = chatAPI ?? api
        #endif
        let cache = ChatCache(rootDirectory: directory)
        self.cache = cache
        importLedger = GuestImportLedger(directory: directory)
        chat = ChatViewModel(
            api: streamingAPI, cache: cache,
            scope: ChatCacheScope(environment: configuration.environmentID, userID: nil)
        )
        if let url = Bundle.main.url(forResource: "BundledDeck", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let bundle = try? JSONDecoder().decode(DeckResponse.self, from: data) {
            cards = bundle.cards
        } else {
            deckNotice = "The bundled deck could not be opened. Connect and refresh to download it."
        }
        // Install this barrier before the SDK can emit a restored session.
        auth.beforeSessionChange = { [weak self] in
            await self?.prepareForSessionChange()
        }
    }

    var accountScopeMatches: Bool { auth.userID == currentUserID }
    var userIsSignedIn: Bool { currentUserID != nil && accountScopeMatches }
    var cacheScope: ChatCacheScope {
        ChatCacheScope(environment: configuration.environmentID, userID: currentUserID)
    }

    func start() async {
        // UI tests use bundled content only and must not touch a real auth
        // Keychain service, send emails, refresh tokens or contact the backend.
        if isUITesting { await refreshHistory(); return }
        await auth.start()
        if auth.userID != currentUserID { await sessionDidChange() }
        await refreshHistory()
        if !isUITesting { await refreshDeck() }
    }

    /// Awaited BEFORE AuthStore changes its token/identity, not just on the
    /// following SwiftUI redraw. Old requests become stale immediately.
    private func prepareForSessionChange() async {
        identityGeneration = UUID()
        historyRequest = UUID()
        openRequest = UUID()
        loadedThreads = [:]
        knownRemoteIDs = []
        history = []
        historyLoading = false
        importBusy = false
        guestImportCount = 0
        let priorOperations = Array(pendingCacheOperations.values)
        await chat.invalidateForAccountChange(preservingDraft: currentUserID == nil)
        // Do not cancel required private-cache cleanup; finish it before a
        // later sign-in can reactivate the same account's namespace.
        for operation in priorOperations { await operation.value }
    }

    func sessionDidChange() async {
        guard auth.userID != currentUserID else { return }
        identityGeneration = UUID()
        let ticket = identityGeneration
        let oldID = currentUserID
        await chat.invalidateForAccountChange()
        guard ticket == identityGeneration else { return }
        // Re-read AFTER the await: another SDK transition may have superseded it.
        let newUserID = auth.userID
        loadedThreads = [:]
        knownRemoteIDs = []
        history = []
        historyLoading = false
        historyNotice = nil
        importNotice = nil
        importBusy = false
        importedGuestCounts = [:]
        currentUserID = newUserID
        chat.changeScope(cacheScope)
        requestIdentity.expectedUserID = newUserID
        if let oldID, oldID != newUserID {
            let oldScope = ChatCacheScope(environment: configuration.environmentID, userID: oldID)
            await performCacheOperation { cache in
                do { try await cache.clear(scope: oldScope) } catch { /* Best effort; never read it under the next identity. */ }
            }
        }
        guard ticket == identityGeneration else { return }
        if let newUserID {
            importedGuestCounts = (try? await importLedger.load(userID: newUserID)) ?? [:]
            guard ticket == identityGeneration else { return }
            await auth.refreshAccount(using: api)
        }
        guard ticket == identityGeneration else { return }
        await refreshHistory()
    }

    func refreshDeck(force: Bool = false) async {
        guard !deckRefreshing, !isUITesting else { return }
        deckRefreshing = true
        defer { deckRefreshing = false }
        if let saved = try? await cache.loadDeck(), !saved.cards.isEmpty {
            cards = saved.cards
            if !force && Date().timeIntervalSince(saved.fetchedAt) < 3_600 {
                deckOffline = false; deckNotice = nil
                return
            }
        }
        do {
            let fresh = try await api.fetchDeck()
            guard !fresh.isEmpty else {
                deckOffline = true
                deckNotice = "No cards came back. The downloaded deck is still available."
                return
            }
            cards = fresh; deckOffline = false; deckNotice = nil
            try? await cache.saveDeck(fresh, fetchedAt: Date())
        } catch {
            guard !Task.isCancelled else { return }
            deckOffline = true
            deckNotice = "Showing the downloaded deck. New chat answers need a connection."
        }
    }

    func refreshHistory() async {
        guard accountScopeMatches else { return }
        let ticket = identityGeneration
        let request = UUID()
        historyRequest = request
        let scope = cacheScope
        historyLoading = true
        defer {
            if ticket == identityGeneration && request == historyRequest { historyLoading = false }
        }
        let local = (try? await cache.loadThreads(scope: scope)) ?? []
        guard ticket == identityGeneration, request == historyRequest else { return }
        loadedThreads = local.reduce(into: [:]) { result, thread in
            let id = ChatID.canonical(thread.id)
            if let old = result[id], old.updatedAt > thread.updatedAt { return }
            result[id] = thread
        }
        history = loadedThreads.values.map(\.summary).sorted { $0.updatedAt > $1.updatedAt }
        if userIsSignedIn && !isUITesting {
            do {
                let response = try await api.listChats()
                guard ticket == identityGeneration, request == historyRequest else { return }
                let remoteIDs = Set(response.chats.map { ChatID.canonical($0.id) })
                knownRemoteIDs = remoteIDs
                history = (response.chats + loadedThreads.values
                    .filter { !remoteIDs.contains(ChatID.canonical($0.id)) }.map(\.summary))
                    .sorted { $0.updatedAt > $1.updatedAt }
                historyNotice = nil
            } catch {
                guard ticket == identityGeneration, request == historyRequest, !Task.isCancelled else { return }
                historyNotice = "Could not refresh your account history. Downloaded conversations are still available."
            }
            let guest = (try? await cache.loadThreads(scope: ChatCacheScope(
                environment: configuration.environmentID, userID: nil
            ))) ?? []
            guard ticket == identityGeneration, request == historyRequest else { return }
            guestImportCount = guest.filter { thread in
                let completed = thread.messages.filter { $0.delivery == .complete && !$0.text.isEmpty }.count
                return completed > (importedGuestCounts[ChatID.canonical(thread.id)] ?? 0)
            }.count
        } else {
            knownRemoteIDs = []; guestImportCount = 0
        }
    }

    func openChat(id rawID: String) async {
        guard accountScopeMatches else { return }
        // Choosing another conversation is an explicit navigation action.
        chat.stop()
        let id = ChatID.canonical(rawID)
        let ticket = identityGeneration
        let request = UUID()
        openRequest = request
        let interaction = chat.interactionRevision
        let selectedSection = section
        let pendingDraft = chat.draft
        @MainActor func stillCurrent() -> Bool {
            ticket == identityGeneration && request == openRequest &&
                interaction == chat.interactionRevision && !chat.isStreaming &&
                section == selectedSection && chat.draft == pendingDraft
        }
        if userIsSignedIn && !isUITesting {
            do {
                let doc = try await api.loadChat(id: id)
                guard stillCurrent() else { return }
                let value = ChatThread(id: doc.chat.id, title: doc.chat.title, messages: doc.messages)
                chat.open(value)
                section = .chat
                let targetScope = cacheScope
                await performCacheOperation { cache in
                    do { try await cache.saveThread(value, scope: targetScope) } catch { /* Server copy remains authoritative. */ }
                }
                return
            } catch {
                guard stillCurrent(), !Task.isCancelled else { return }
                if let problem = error as? ShalomAPIError, problem.statusCode == 404 {
                    // A known remote chat that disappeared is not replaced by
                    // a cache. A never-saved local draft is still usable.
                    if !knownRemoteIDs.contains(id), let local = loadedThreads[id] {
                        chat.open(local)
                        section = .chat
                    } else {
                        historyNotice = "That conversation is no longer available to this account."
                    }
                    return
                }
                if let local = loadedThreads[id] {
                    chat.open(local, offline: true)
                    section = .chat
                    return
                }
                historyNotice = "Could not open that conversation. Try again when connected."
                return
            }
        }
        if stillCurrent(), let local = loadedThreads[id] {
            chat.open(local)
            section = .chat
        }
    }

    func importGuestHistory() async {
        guard userIsSignedIn, let userID = currentUserID, !importBusy else { return }
        let ticket = identityGeneration
        importBusy = true
        defer { if ticket == identityGeneration { importBusy = false } }
        let guestScope = ChatCacheScope(environment: configuration.environmentID, userID: nil)
        let guest = (try? await cache.loadThreads(scope: guestScope)) ?? []
        guard ticket == identityGeneration else { return }
        let entries = guest.filter { thread in
            thread.messages.filter { $0.delivery == .complete && !$0.text.isEmpty }.count
                > (importedGuestCounts[ChatID.canonical(thread.id)] ?? 0)
        }.prefix(30).compactMap { t -> ChatImportEntry? in
                let complete = t.messages.filter { $0.delivery == .complete && !$0.text.isEmpty }
                guard !complete.isEmpty else { return nil }
                return ChatImportEntry(
                    id: ChatID.canonical(t.id), title: HistoryPolicy.clip(t.title, maxUTF16: 200), updatedAt: t.updatedAt,
                    messages: complete.prefix(200).map {
                        ChatImportMessage(role: $0.role, text: Self.importText($0.text))
                    }
                )
            }
        guard !entries.isEmpty else { importNotice = "There are no completed conversations to import."; return }
        do {
            let result = try await api.importChats(entries)
            guard ticket == identityGeneration else { return }
            let saved = Set(result.saved.map { ChatID.canonical($0) })
            let acknowledged = Dictionary(uniqueKeysWithValues: entries
                .filter { saved.contains(ChatID.canonical($0.id)) }
                .map { (ChatID.canonical($0.id), $0.messages.count) })
            for (id, count) in acknowledged {
                importedGuestCounts[id] = max(importedGuestCounts[id] ?? 0, count)
            }
            try? await importLedger.record(acknowledged, userID: userID)
            guard ticket == identityGeneration else { return }
            importNotice = result.skipped.isEmpty
                ? "Completed messages added to your account. Partial answers and original device copies are kept here."
                : "Some conversations could not be imported. Their device copies are still here."
            await refreshHistory()
        } catch {
            guard ticket == identityGeneration else { return }
            importNotice = "Import did not finish. Nothing on this device was deleted."
        }
    }

    func askFromCard(_ question: String) {
        guard accountScopeMatches else { return }
        openRequest = UUID()
        chat.newChat()
        section = .chat
        chat.send(question)
    }

    func showCard(id: String) {
        focusedCardID = id
        section = .flashcards
    }

    func handleURL(_ url: URL) async {
        openRequest = UUID()
        if url.scheme?.lowercased() == "shalom", url.host == "auth", url.path == "/callback" {
            await auth.handleCallback(url)
            await sessionDidChange()
            return
        }
        // HTTPS callbacks only work once associated domains are configured.
        // Custom app links can already prefill/navigate; neither can send.
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        if (url.scheme == "https" && url.host == configuration.apiBaseURL.host)
            || url.scheme == "shalom" {
            if let id = parts?.queryItems?.first(where: { $0.name == "card" })?.value {
                showCard(id: id)
            } else if let q = parts?.queryItems?.first(where: { $0.name == "q" })?.value {
                chat.draft = String(q.prefix(2_000))
                section = .chat
            }
        }
    }

    func cancelPendingHistoryOpen() { openRequest = UUID() }

    private func performCacheOperation(_ operation: @escaping @Sendable (ChatCache) async -> Void) async {
        let id = UUID()
        let task = Task { [cache] in await operation(cache) }
        pendingCacheOperations[id] = task
        await task.value
        pendingCacheOperations[id] = nil
    }

    private static func importText(_ text: String) -> String {
        var used = 0
        return String(text.prefix { character in
            let size = String(character).utf16.count
            guard used + size <= 20_000 else { return false }
            used += size
            return true
        })
    }
}
