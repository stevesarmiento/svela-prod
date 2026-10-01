import Foundation

/// Mints ids for numeric characters that did not persist from the previous value.
///
/// Numeric and text ids share a namespace. A NUL prefix cannot occur in a text-derived id, and the
/// counter only climbs, so neither can collide with the other. Process-wide, like torph's module
/// counter: the same id never needs to be reproduced, it only needs to be unique.
enum IDMinter {
    private static let prefix = "\u{0}n"
    nonisolated(unsafe) private static var next = 0
    private static let lock = NSLock()

    static func mint() -> String {
        lock.lock()
        defer { lock.unlock() }
        let id = "\(prefix)\(next)"
        next += 1
        return id
    }
}

enum NumberSegmenter {
    /// Separators that can appear *between* digits without ending the number.
    static let coreSeparators: Set<Character> = [".", ",", "'", "\u{00A0}", "\u{202F}", "\u{2009}", "\u{2007}"]
    static let prefixChars: Set<Character> = ["+", "-", "\u{2212}", "(", "#"]
    static let suffixChars: Set<Character> = ["%", ".", ",", "!", "?", ":", ";", ")", "\"", "'", "\u{201D}", "\u{2019}"]

    // Past this the digits overlap into a smear and nothing should carry across. Three is
    // where the corpus divides: cases needing their slide sit at 0-1, replacements at 3+.
    static let magnitudeJump = 3

    static func isDigit(_ char: Character) -> Bool {
        char >= "0" && char <= "9"
    }

    static func hasDigit(_ value: String) -> Bool {
        value.contains(where: isDigit)
    }

    /// What is left of a token once its digits and separators go — "$", "%", "()".
    static func numericSkeleton(_ word: String) -> String {
        String(word.filter { !isDigit($0) && !coreSeparators.contains($0) })
    }

    private static func isAffix(_ char: Character, _ set: Set<Character>) -> Bool {
        set.contains(char) || char.isCurrencySymbol
    }

    /// Whether a token is a quantity. Strict on purpose, and on by default: merely
    /// containing a digit is not enough, or "COVID-19" and "2024-01-01" morph by place.
    static func isNumericWord(_ word: String) -> Bool {
        let chars = Array(word)
        var start = 0
        var end = chars.count

        while start < end && isAffix(chars[start], prefixChars) { start += 1 }
        while end > start && isAffix(chars[end - 1], suffixChars) { end -= 1 }

        if start >= end { return false }
        if !isDigit(chars[start]) || !isDigit(chars[end - 1]) { return false }

        for i in start..<end {
            let char = chars[i]
            if !isDigit(char) && !coreSeparators.contains(char) { return false }
        }
        return true
    }

    static func classifyKind(_ char: Character) -> SegmentKind {
        isDigit(char) ? .digit : .symbol
    }

    /// The locale's decimal separator — the pivot every alignment is measured from.
    static func decimalSeparator(_ locale: Locale) -> Character {
        locale.decimalSeparator?.first ?? "."
    }

    /// Per-character segments, matched by caret where `cursorIndex` is given, else by place.
    static func segmentNumber(
        _ value: String,
        prevSegments: [Segment]? = nil,
        cursorIndex: Int? = nil,
        decimalChar: Character = "."
    ) -> [Segment] {
        let chars = Array(value)

        guard let prevSegments, !prevSegments.isEmpty else {
            return simpleSegment(chars)
        }

        let oldChars: [Character] = prevSegments.map { seg in
            seg.string == Segment.nbsp ? " " : (seg.string.first ?? " ")
        }

        let matches = cursorIndex != nil
            ? cursorMatch(oldChars, chars, cursor: cursorIndex!, decimalChar: decimalChar)
            : placeMatch(oldChars, chars, decimalChar: decimalChar)

        var usedIDs = Set<String>()
        for (_, oldIdx) in matches {
            usedIDs.insert(prevSegments[oldIdx].id)
        }

        var result: [Segment] = []
        result.reserveCapacity(chars.count)

        for (i, char) in chars.enumerated() {
            let kind = classifyKind(char)
            let display = char == " " ? Segment.nbsp : String(char)
            if let oldIdx = matches[i] {
                result.append(Segment(id: prevSegments[oldIdx].id, string: display, kind: kind))
            } else {
                var id = IDMinter.mint()
                while usedIDs.contains(id) { id = IDMinter.mint() }
                usedIDs.insert(id)
                result.append(Segment(id: id, string: display, kind: kind))
            }
        }
        return result
    }

    /// Fresh segmentation for a number with nothing to carry over from.
    private static func simpleSegment(_ chars: [Character]) -> [Segment] {
        chars.map { char in
            Segment(id: IDMinter.mint(), string: char == " " ? Segment.nbsp : String(char), kind: classifyKind(char))
        }
    }

    // MARK: Cursor matching

    /// The caret in the new string says where the edit was; both sides of it map across.
    ///
    /// The walk is over everything *but* the grouping separators. A comma reflows with the
    /// magnitude rather than with the keystroke, so counting it into the edit would shear
    /// every match past the caret — typing a digit that carries "123" to "1,234" is a
    /// two-character delta of which the user typed one, and they are not adjacent.
    static func cursorMatch(
        _ oldChars: [Character],
        _ newChars: [Character],
        cursor: Int,
        decimalChar: Character
    ) -> [Int: Int] {
        var matches: [Int: Int] = [:]

        let oldKept = keptIndices(oldChars, decimalChar)
        let newKept = keptIndices(newChars, decimalChar)
        func pair(_ ni: Int, _ oi: Int) { matches[newKept[ni]] = oldKept[oi] }

        var keptCursor = 0
        while keptCursor < newKept.count && newKept[keptCursor] < cursor { keptCursor += 1 }

        let lenDiff = newKept.count - oldKept.count

        if lenDiff > 0 {
            let editStart = keptCursor - lenDiff
            var i = 0
            while i < editStart && i < oldKept.count {
                pair(i, i)
                i += 1
            }
            for i in keptCursor..<max(keptCursor, newKept.count) {
                let oldIdx = i - lenDiff
                if oldIdx >= 0 && oldIdx < oldKept.count { pair(i, oldIdx) }
            }
        } else if lenDiff < 0 {
            var i = 0
            while i < keptCursor && i < newKept.count {
                pair(i, i)
                i += 1
            }
            for i in keptCursor..<max(keptCursor, newKept.count) {
                let oldIdx = i - lenDiff
                if oldIdx >= 0 && oldIdx < oldKept.count { pair(i, oldIdx) }
            }
        } else {
            for i in 0..<newKept.count where newChars[newKept[i]] == oldChars[oldKept[i]] {
                pair(i, i)
            }
        }

        // Paired from the units end, so the thousands comma stays the thousands comma.
        let oldSeps = groupingIndices(oldChars, decimalChar)
        let newSeps = groupingIndices(newChars, decimalChar)
        var k = 1
        while k <= oldSeps.count && k <= newSeps.count {
            let oldIdx = oldSeps[oldSeps.count - k]
            let newIdx = newSeps[newSeps.count - k]
            if oldChars[oldIdx] == newChars[newIdx] { matches[newIdx] = oldIdx }
            k += 1
        }

        return matches
    }

    private static func isGrouping(_ char: Character, _ decimalChar: Character) -> Bool {
        char != decimalChar && coreSeparators.contains(char)
    }

    private static func keptIndices(_ chars: [Character], _ decimalChar: Character) -> [Int] {
        chars.indices.filter { !isGrouping(chars[$0], decimalChar) }
    }

    private static func groupingIndices(_ chars: [Character], _ decimalChar: Character) -> [Int] {
        chars.indices.filter { isGrouping(chars[$0], decimalChar) }
    }

    // MARK: Place matching

    /// Pairs characters by distance from the decimal separator, not left to right — a
    /// digit's identity is its column. Both walks skip mismatches rather than stopping.
    static func placeMatch(
        _ oldChars: [Character],
        _ newChars: [Character],
        decimalChar: Character
    ) -> [Int: Int] {
        var matches: [Int: Int] = [:]

        var start = 0
        while start < oldChars.count,
              start < newChars.count,
              oldChars[start] == newChars[start],
              !isDigit(oldChars[start]) {
            matches[start] = start
            start += 1
        }

        var oldEnd = oldChars.count
        var newEnd = newChars.count
        while oldEnd > start,
              newEnd > start,
              oldChars[oldEnd - 1] == newChars[newEnd - 1],
              !isDigit(oldChars[oldEnd - 1]) {
            matches[newEnd - 1] = oldEnd - 1
            oldEnd -= 1
            newEnd -= 1
        }

        let oldPivot = findPivot(oldChars, start: start, end: oldEnd, decimalChar: decimalChar)
        let newPivot = findPivot(newChars, start: start, end: newEnd, decimalChar: decimalChar)

        let oldDigits = integerDigits(oldChars, start: start, pivot: oldPivot)
        let newDigits = integerDigits(newChars, start: start, pivot: newPivot)

        // A side with no digits is a field being typed into or emptied, not a magnitude.
        if oldDigits > 0 && newDigits > 0 && abs(oldDigits - newDigits) >= magnitudeJump {
            return matches
        }

        func matchSeparator(_ oldIndex: Int, _ newIndex: Int) {
            let char = oldChars[oldIndex]
            if isDigit(char) { return }
            if char == newChars[newIndex] { matches[newIndex] = oldIndex }
        }

        /// Pairs the digits on one side of the pivot, by column where the count matches and by
        /// subsequence where it changed. Reshaping is integer-side only — a fraction's columns
        /// are fixed by the decimal point, so 1.5 → 1.25 gains a hundredths rather than sliding
        /// the 5. `towardsPivot` breaks ties on repeated digits towards the units column.
        /// Returns whether digits survived a reshape.
        func matchDigits(_ oldFrom: Int, _ oldTo: Int, _ newFrom: Int, _ newTo: Int, towardsPivot: Bool) -> Bool {
            let oldIndices = digitIndices(oldChars, from: oldFrom, to: oldTo)
            let newIndices = digitIndices(newChars, from: newFrom, to: newTo)

            if oldIndices.count == newIndices.count || !towardsPivot {
                let pairs = min(oldIndices.count, newIndices.count)
                for k in 0..<pairs {
                    let oi = oldIndices[k]
                    let ni = newIndices[k]
                    if oldChars[oi] == newChars[ni] { matches[ni] = oi }
                }
                return false
            }

            // Reversed, so the subsequence walk resolves its ties from the units end.
            let oldRun = oldIndices.map { oldChars[$0] }.reversed()
            let newRun = newIndices.map { newChars[$0] }.reversed()
            let (ai, bi) = LCS.indices(Array(oldRun), Array(newRun))

            for k in 0..<ai.count {
                let oi = oldIndices[oldIndices.count - 1 - ai[k]]
                let ni = newIndices[newIndices.count - 1 - bi[k]]
                matches[ni] = oi
            }
            return !ai.isEmpty
        }

        // A separator holds its distance from the pivot — what slides the comma one group
        // along on 999,999 → 1,000,000. After a reshape it would have to cross the digits
        // that carried, the two passing in opposite directions, so it leaves instead.
        let reshaped = matchDigits(start, oldPivot, start, newPivot, towardsPivot: true)
        if !reshaped {
            var k = 1
            while oldPivot - k >= start && newPivot - k >= start {
                matchSeparator(oldPivot - k, newPivot - k)
                k += 1
            }
        }

        // Absent from either value, the pivot is that value's end.
        if oldPivot < oldEnd && newPivot < newEnd {
            matches[newPivot] = oldPivot

            var k = 1
            while oldPivot + k < oldEnd && newPivot + k < newEnd {
                matchSeparator(oldPivot + k, newPivot + k)
                k += 1
            }
            _ = matchDigits(oldPivot + 1, oldEnd, newPivot + 1, newEnd, towardsPivot: false)
        }

        return matches
    }

    private static func digitIndices(_ chars: [Character], from: Int, to: Int) -> [Int] {
        guard from < to else { return [] }
        return (from..<to).filter { isDigit(chars[$0]) }
    }

    private static func integerDigits(_ chars: [Character], start: Int, pivot: Int) -> Int {
        guard start < pivot else { return 0 }
        return (start..<pivot).reduce(0) { $0 + (isDigit(chars[$1]) ? 1 : 0) }
    }

    /// Last decimal separator within the affix-trimmed range, else the range end.
    private static func findPivot(_ chars: [Character], start: Int, end: Int, decimalChar: Character) -> Int {
        var i = end - 1
        while i >= start {
            if chars[i] == decimalChar { return i }
            i -= 1
        }
        return end
    }
}
