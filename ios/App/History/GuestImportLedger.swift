import CryptoKit
import Foundation

/// Per-account import acknowledgements, never conversation text or tokens.
/// Counts (not just IDs) allow later guest turns to be offered for import too.
actor GuestImportLedger {
    enum LedgerError: Error { case unsupportedFormat, tooLarge }
    private let directory: URL
    private struct Probe: Decodable { let version: Int }
    private struct Record: Codable { let version: Int; let completedMessageCounts: [String: Int] }

    init(directory: URL) { self.directory = directory.appendingPathComponent("ImportAcknowledgements", isDirectory: true) }

    func load(userID: String) throws -> [String: Int] {
        guard let data = try read(userID) else { return [:] }
        let version = try JSONDecoder().decode(Probe.self, from: data).version
        // Old id-only acknowledgements have no count. Offer once more; the
        // server appends only a missing tail, so that cannot duplicate rows.
        if version == 1 { return [:] }
        guard version == 2 else { throw LedgerError.unsupportedFormat }
        let record = try JSONDecoder().decode(Record.self, from: data)
        return Dictionary(record.completedMessageCounts.prefix(2_000).map {
            ($0.key.lowercased(), max(0, min($0.value, 200)))
        }, uniquingKeysWith: max)
    }

    func record(_ counts: [String: Int], userID: String) throws {
        if let data = try read(userID) {
            let version = try JSONDecoder().decode(Probe.self, from: data).version
            guard version == 1 || version == 2 else { throw LedgerError.unsupportedFormat }
        }
        var all = try load(userID: userID)
        for (id, count) in counts {
            let id = id.lowercased()
            all[id] = max(all[id] ?? 0, max(0, min(count, 200)))
        }
        let keys = all.keys.sorted().suffix(2_000)
        all = Dictionary(uniqueKeysWithValues: keys.map { ($0, all[$0] ?? 0) })
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var privateDirectory = directory
        try privateDirectory.setResourceValues(values)
        let data = try JSONEncoder().encode(Record(version: 2, completedMessageCounts: all))
        #if os(iOS)
        try data.write(to: file(userID), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: file(userID), options: [.atomic])
        #endif
        var url = file(userID)
        try url.setResourceValues(values)
    }

    private func read(_ userID: String) throws -> Data? {
        let url = file(userID)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= 128_000 else { throw LedgerError.tooLarge }
        return try Data(contentsOf: url)
    }

    private func file(_ userID: String) -> URL {
        let key = SHA256.hash(data: Data(userID.lowercased().utf8))
            .map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent(key).appendingPathExtension("json")
    }
}
