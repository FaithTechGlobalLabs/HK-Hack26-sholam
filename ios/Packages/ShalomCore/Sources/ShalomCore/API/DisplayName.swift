import Foundation

/// The account display name exactly as the server normalises it
/// (`displayNameSchema` in `src/lib/account/types.ts`): drop code points
/// below U+0020 and U+007F, collapse every run of JavaScript whitespace
/// (`\s`) to one space, trim, then require 1...40 UTF-16 units.
public enum DisplayName {
    /// `DISPLAY_NAME_MAX`, measured in UTF-16 units like JavaScript `length`.
    public static let maxUTF16 = 40
    /// The server's own 400 text for a name it refuses.
    public static let invalidMessage = "Use 1 to 40 characters for your name"

    /// The name the server would store, or nil when it would refuse it.
    public static func normalized(_ raw: String) -> String? {
        var out = String.UnicodeScalarView()
        var pendingSpace = false
        for scalar in raw.unicodeScalars {
            let value = scalar.value
            if value < 0x20 || value == 0x7F { continue }
            if isJavaScriptWhitespace(value) {
                pendingSpace = true
                continue
            }
            // Leading whitespace is trimmed; inner runs become one space.
            if pendingSpace, !out.isEmpty { out.append(" ") }
            pendingSpace = false
            out.append(scalar)
        }
        let name = String(out)
        guard !name.isEmpty, name.utf16.count <= maxUTF16 else { return nil }
        return name
    }

    /// ECMAScript `WhiteSpace` + `LineTerminator` (what `\s` and `trim` use),
    /// minus the C0 controls already dropped above.
    static func isJavaScriptWhitespace(_ value: UInt32) -> Bool {
        switch value {
        case 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }
}
