import Foundation

/// Numeric segments slide instead of fading, and digits and symbols slide opposite ways.
public enum SegmentKind: String, Hashable, Sendable {
    case digit
    case symbol
}

/// One morphable unit of a value: a word, a grapheme, or (inside a number) a single character.
public struct Segment: Hashable, Identifiable, Sendable {
    public var id: String
    public var string: String
    /// Absent for ordinary text.
    public var kind: SegmentKind?

    public init(id: String, string: String, kind: SegmentKind? = nil) {
        self.id = id
        self.string = string
        self.kind = kind
    }
}

public extension Segment {
    static let nbsp = "\u{00A0}"
    static let newline = "\n"
    /// The stand-in for an emptied value: keeps a line box while everything exits.
    static let emptyID = "empty"
    static let emptyPlaceholder = "\u{200B}"

    var isNewline: Bool { string == Segment.newline }
    var isSpace: Bool { string == Segment.nbsp }
}

public struct DiffOptions: Hashable, Sendable {
    /// Numeric words morph by place value. Off falls back to character LCS.
    public var numbers: Bool
    /// Caret position, honoured only when the value holds a single number.
    public var cursorIndex: Int?

    public init(numbers: Bool = true, cursorIndex: Int? = nil) {
        self.numbers = numbers
        self.cursorIndex = cursorIndex
    }
}

public struct DiffResult: Sendable {
    public var segments: [Segment]
    /// Old whole-word segments that were cut into per-character segments, keyed by the word's id.
    public var splits: [String: [Segment]]
}
