import Foundation

/// Chat ids are UUIDs. The web app and Postgres use the lowercase form, while
/// Foundation's `UUID().uuidString` is uppercase, so every id the app sends,
/// caches or compares goes through `canonical(_:)` first.
public enum ChatID {
    /// A new id in the server's lowercase form.
    public static func make() -> String { UUID().uuidString.lowercased() }

    /// The lowercase form of a UUID id; anything that is not a UUID is
    /// returned unchanged (it is never saved by the server).
    public static func canonical(_ id: String) -> String {
        guard let uuid = UUID(uuidString: id) else { return id }
        return uuid.uuidString.lowercased()
    }

    /// Case-insensitive equality for UUID ids.
    public static func same(_ a: String, _ b: String) -> Bool { canonical(a) == canonical(b) }
}
