import Foundation

/// Which local chats a cache read or write belongs to: one API environment
/// and one account (or the guest). Different scopes never share a file.
public struct ChatCacheScope: Equatable, Hashable, Codable, Sendable {
    public let environment: String
    /// Supabase user id, or nil for the signed-out guest.
    public let userID: String?
    public init(environment: String, userID: String?) {
        self.environment = environment
        self.userID = userID
    }

    /// Directory name: base64url of the environment, then `g` (guest) or
    /// `u.` + base64url(user id). Reversible and collision-free; contains
    /// no auth material.
    var directoryName: String {
        let env = Self.base64URL(environment)
        guard let userID else { return "\(env)~g" }
        return "\(env)~u.\(Self.base64URL(userID))"
    }

    var isValid: Bool {
        !environment.isEmpty && environment.utf8.count <= 512
            && (userID.map { !$0.isEmpty && $0.utf8.count <= 128 } ?? true)
            && directoryName.utf8.count <= 240
    }

    static func base64URL(_ string: String) -> String {
        Data(string.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// The last public deck fetched, with when it was fetched.
public struct CachedDeck: Codable, Equatable, Sendable {
    public var cards: [Flashcard]
    public var fetchedAt: Date
    public init(cards: [Flashcard], fetchedAt: Date) {
        self.cards = cards; self.fetchedAt = fetchedAt
    }
    public static let defaultMaxAge: TimeInterval = 24 * 60 * 60
    public func age(now: Date = Date()) -> TimeInterval { max(0, now.timeIntervalSince(fetchedAt)) }
    public func isStale(now: Date = Date(), maxAge: TimeInterval = CachedDeck.defaultMaxAge) -> Bool {
        age(now: now) > maxAge || fetchedAt > now.addingTimeInterval(300)
    }
}

public enum ChatCacheError: Error, Equatable, Sendable {
    case invalidScope
    /// The file could not be read as this cache's format. It has been removed;
    /// the caller should fall back (empty history / bundled deck).
    case corrupted
    case tooLarge
    /// The file on disk was written in another format version (for example
    /// by a newer build). It is left untouched and nothing was written.
    case unsupportedVersion
}

/// Local, private cache of chat threads (per environment + account/guest)
/// and of the public deck. Writes are atomic with complete file protection;
/// the directory is excluded from backups. Files carry a format version.
/// No auth tokens are ever written here.
public actor ChatCache {
    public static let formatVersion = 1
    public static let maxThreads = 30
    public static let maxMessagesPerThread = 200
    public static let maxDeckCards = 1_000
    /// Scope folders (one `threads.json` each) kept on disk. Beyond this the
    /// least recently written account scopes go first, guests last; the
    /// scope being written is never removed.
    public static let maxScopes = 8
    static let maxFileBytes = 16 << 20

    private let root: URL
    private var prepared = false

    public init(rootDirectory: URL? = nil) {
        if let rootDirectory {
            root = rootDirectory
        } else {
            let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            root = base.appending(path: "ShalomCache", directoryHint: .isDirectory)
        }
    }

    // MARK: Chats

    /// Newest first. Messages saved mid-stream come back `.incomplete`.
    /// UUID ids come back lowercase (`ChatID.canonical`), one entry per id.
    /// A file from another format version reads as empty and is left in place.
    public func loadThreads(scope: ChatCacheScope) async throws -> [ChatThread] {
        let url = try threadsURL(scope)
        switch try loadThreadsFile(url, scope: scope) {
        case .absent, .otherVersion: return []
        case .value(let threads): return threads
        }
    }

    /// Inserts or replaces one thread. A corrupted file is replaced; a file
    /// from another format version is never overwritten (throws
    /// `.unsupportedVersion`). The thread being saved is always kept, even
    /// when older than the `maxThreads - 1` newest others.
    public func saveThread(_ thread: ChatThread, scope: ChatCacheScope) async throws {
        let url = try threadsURL(scope)
        var threads: [ChatThread]
        do {
            switch try loadThreadsFile(url, scope: scope) {
            case .absent: threads = []
            case .otherVersion: throw ChatCacheError.unsupportedVersion
            case .value(let existing): threads = existing
            }
        } catch ChatCacheError.corrupted {
            threads = []
        }
        var saved = Self.settled(thread)
        saved.id = ChatID.canonical(saved.id)
        if saved.messages.count > Self.maxMessagesPerThread {
            saved.messages = Array(saved.messages.suffix(Self.maxMessagesPerThread))
        }
        threads.removeAll { $0.id == saved.id }
        threads.sort { $0.updatedAt > $1.updatedAt }
        threads = Array(threads.prefix(Self.maxThreads - 1))
        threads.append(saved)
        threads.sort { $0.updatedAt > $1.updatedAt }
        try write(ThreadsFile(version: Self.formatVersion, scope: scope, threads: threads), to: url,
                  protection: .completeFileProtectionUntilFirstUserAuthentication)
        pruneScopes(keeping: scope)
    }

    private func loadThreadsFile(_ url: URL, scope: ChatCacheScope) throws -> ReadResult<[ChatThread]> {
        let result: ReadResult<ThreadsFile> = try read(url)
        guard case .value(let envelope) = result else {
            return result.isOtherVersion ? .otherVersion : .absent
        }
        guard envelope.scope == scope else {
            try? FileManager.default.removeItem(at: url)
            throw ChatCacheError.corrupted
        }
        var seen = Set<String>()
        var threads: [ChatThread] = []
        for var thread in envelope.threads.map(Self.settled) {
            thread.id = ChatID.canonical(thread.id)
            guard seen.insert(thread.id).inserted else { continue }
            threads.append(thread)
        }
        return .value(threads)
    }

    /// Keeps at most `maxScopes` scope folders. Best effort: a failure here
    /// never fails the save that triggered it.
    private func pruneScopes(keeping current: ChatCacheScope) {
        let manager = FileManager.default
        let keys: [URLResourceKey] = [.isDirectoryKey, .contentModificationDateKey]
        guard let entries = try? manager.contentsOfDirectory(at: chatsDirectory, includingPropertiesForKeys: keys,
                                                             options: [.skipsHiddenFiles]),
              entries.count > Self.maxScopes
        else { return }
        struct Candidate { let url: URL; let isGuest: Bool; let modified: Date }
        var candidates: [Candidate] = []
        for entry in entries.prefix(1_000) where entry.lastPathComponent != current.directoryName {
            let values = try? entry.resourceValues(forKeys: Set(keys))
            candidates.append(Candidate(url: entry, isGuest: entry.lastPathComponent.hasSuffix("~g"),
                                        modified: values?.contentModificationDate ?? .distantPast))
        }
        // Accounts (their chats are on the server) before guests, oldest first.
        candidates.sort { lhs, rhs in
            if lhs.isGuest != rhs.isGuest { return !lhs.isGuest }
            return lhs.modified < rhs.modified
        }
        var excess = entries.count - Self.maxScopes
        for candidate in candidates where excess > 0 {
            if (try? manager.removeItem(at: candidate.url)) != nil { excess -= 1 }
        }
    }

    /// Removes only this scope's chats (sign-out of one account or the guest).
    public func clear(scope: ChatCacheScope) async throws {
        guard scope.isValid else { throw ChatCacheError.invalidScope }
        let directory = chatsDirectory.appending(path: scope.directoryName, directoryHint: .isDirectory)
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }

    // MARK: Public deck

    public func loadDeck() async throws -> CachedDeck? {
        let result: ReadResult<DeckFile> = try read(deckURL)
        guard case .value(let file) = result else { return nil }
        return file.deck
    }

    /// Throws `.unsupportedVersion`, writing nothing, when the deck file on
    /// disk has another format version.
    public func saveDeck(_ cards: [Flashcard], fetchedAt: Date = Date()) async throws {
        guard cards.count <= Self.maxDeckCards else { throw ChatCacheError.tooLarge }
        if try storedVersion(at: deckURL).map({ $0 != Self.formatVersion }) ?? false {
            throw ChatCacheError.unsupportedVersion
        }
        try write(DeckFile(version: Self.formatVersion, deck: CachedDeck(cards: cards, fetchedAt: fetchedAt)),
                  to: deckURL, protection: .completeFileProtectionUntilFirstUserAuthentication)
    }

    // MARK: Files

    private struct ThreadsFile: Codable {
        let version: Int
        let scope: ChatCacheScope
        let threads: [ChatThread]
    }

    private struct DeckFile: Codable {
        let version: Int
        let deck: CachedDeck
    }

    private struct VersionProbe: Decodable { let version: Int }

    private var versionDirectory: URL { root.appending(path: "v\(Self.formatVersion)", directoryHint: .isDirectory) }
    private var chatsDirectory: URL { versionDirectory.appending(path: "chats", directoryHint: .isDirectory) }
    private var deckURL: URL { versionDirectory.appending(path: "public-deck.json", directoryHint: .notDirectory) }

    private func threadsURL(_ scope: ChatCacheScope) throws -> URL {
        guard scope.isValid else { throw ChatCacheError.invalidScope }
        return chatsDirectory
            .appending(path: scope.directoryName, directoryHint: .isDirectory)
            .appending(path: "threads.json", directoryHint: .notDirectory)
    }

    private enum ReadResult<Value> {
        case absent
        /// Written by another format version; left in place, never overwritten.
        case otherVersion
        case value(Value)

        var isOtherVersion: Bool {
            if case .otherVersion = self { return true }
            return false
        }
    }

    /// `.absent`, `.otherVersion` (left in place) or the decoded value;
    /// `.corrupted` (file removed) when it does not decode or is oversized.
    private func read<T: Decodable>(_ url: URL) throws -> ReadResult<T> {
        let manager = FileManager.default
        guard manager.fileExists(atPath: url.path) else { return .absent }
        let size = (try? manager.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size <= Self.maxFileBytes else {
            try? manager.removeItem(at: url)
            throw ChatCacheError.corrupted
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        // An I/O failure (for example, protected data while the device is
        // locked) is rethrown as-is and never deletes the file.
        let data = try Data(contentsOf: url)
        do {
            let probe = try decoder.decode(VersionProbe.self, from: data)
            guard probe.version == Self.formatVersion else { return .otherVersion }
            return .value(try decoder.decode(T.self, from: data))
        } catch {
            try? manager.removeItem(at: url)
            throw ChatCacheError.corrupted
        }
    }

    /// The `version` of the file at `url`; nil when absent, oversized or not
    /// a versioned file (those are safe to replace).
    private func storedVersion(at url: URL) throws -> Int? {
        let manager = FileManager.default
        guard manager.fileExists(atPath: url.path) else { return nil }
        let size = (try? manager.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        guard size <= Self.maxFileBytes else { return nil }
        let data = try Data(contentsOf: url)
        return (try? JSONDecoder().decode(VersionProbe.self, from: data))?.version
    }

    private func write<T: Encodable>(_ value: T, to url: URL, protection: Data.WritingOptions) throws {
        try prepareRoot()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        let data = try encoder.encode(value)
        guard data.count <= Self.maxFileBytes else { throw ChatCacheError.tooLarge }
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: Self.directoryAttributes)
        #if os(iOS)
        try data.write(to: url, options: [.atomic, protection])
        #else
        // macOS core tests do not request iOS data-protection attributes.
        try data.write(to: url, options: [.atomic])
        #endif
    }

    private static var directoryAttributes: [FileAttributeKey: Any]? {
        #if os(iOS)
        return [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        #else
        return nil
        #endif
    }

    /// Creates the root once and excludes it (and so everything in it) from backups.
    private func prepareRoot() throws {
        guard !prepared else { return }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
                                                attributes: Self.directoryAttributes)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var url = root
        try url.setResourceValues(values)
        prepared = true
    }

    /// A message cannot still be streaming once it is on disk.
    private static func settled(_ thread: ChatThread) -> ChatThread {
        var copy = thread
        for index in copy.messages.indices where copy.messages[index].delivery == .streaming {
            copy.messages[index].delivery = .incomplete
            copy.messages[index].hasFinalCitationCheck = false
        }
        return copy
    }
}
