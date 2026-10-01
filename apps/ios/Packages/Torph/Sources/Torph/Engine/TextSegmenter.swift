import Foundation

/// A collision makes two segments fight over one element and one silently loses its
/// text, so uniqueness has to hold across the whole value, not per line.
final class IDAllocator {
    private var used = Set<String>()

    func reserve(_ id: String) { used.insert(id) }
    func has(_ id: String) -> Bool { used.contains(id) }

    func take(_ base: String) -> String {
        if !used.contains(base) {
            used.insert(base)
            return base
        }
        var i = 1
        while used.contains("\(base)~\(i)") { i += 1 }
        let id = "\(base)~\(i)"
        used.insert(id)
        return id
    }
}

struct WordGroup {
    var word: String
    var segments: [Segment]
}

enum TextSegmenter {
    /// Whitespace-delimited words — the unit the diff aligns on, and so a number's bounds.
    static func groupIntoWords(_ segments: [Segment]) -> [WordGroup] {
        var groups: [WordGroup] = []
        var current: [Segment] = []

        func flush() {
            guard !current.isEmpty else { return }
            groups.append(WordGroup(word: current.map(\.string).joined(), segments: current))
            current = []
        }

        for seg in segments {
            if seg.isSpace || seg.isNewline { flush() } else { current.append(seg) }
        }
        flush()
        return groups
    }

    /// Re-cuts every numeric word into per-character segments carrying a kind. A pass over
    /// the finished segmentation, not part of it: the word segmenter splits "$1,234" on its
    /// own terms, and regrouping on whitespace is what keeps this and the diff agreeing.
    private static func expandNumbers(_ segments: [Segment]) -> [Segment] {
        var out: [Segment] = []
        var run: [Segment] = []

        func flush() {
            guard !run.isEmpty else { return }
            let word = run.map(\.string).joined()
            if NumberSegmenter.isNumericWord(word) {
                out.append(contentsOf: NumberSegmenter.segmentNumber(word))
            } else {
                out.append(contentsOf: run)
            }
            run = []
        }

        for seg in segments {
            if seg.isSpace || seg.isNewline {
                flush()
                out.append(seg)
            } else {
                run.append(seg)
            }
        }
        flush()
        return out
    }

    static func segmentText(_ value: String, locale: Locale, numbers: Bool = true) -> [Segment] {
        let hasNewlines = value.contains("\n")
        let byWord = value.contains(" ") || hasNewlines
        let alloc = IDAllocator()

        if hasNewlines {
            // `offset` indexes the full value, so ids derived from it stay unique across lines.
            let lines = value.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            var all: [Segment] = []
            var offset = 0

            for (lineIndex, line) in lines.enumerated() {
                if lineIndex > 0 {
                    all.append(Segment(id: alloc.take("newline-\(offset)"), string: Segment.newline))
                    offset += 1
                }
                if !line.isEmpty {
                    all.append(contentsOf: segmentLine(line, locale: locale, byWord: true, offset: offset, alloc: alloc))
                }
                offset += line.count
            }
            return numbers ? expandNumbers(all) : all
        }

        let segments = segmentLine(value, locale: locale, byWord: byWord, offset: 0, alloc: alloc)
        return numbers ? expandNumbers(segments) : segments
    }

    /// Word granularity mirrors `Intl.Segmenter`: every word is one segment, and every character
    /// between words (spaces, punctuation, symbols, emoji) is its own segment. Grapheme granularity
    /// is one segment per `Character`.
    static func segmentLine(_ line: String, locale: Locale, byWord: Bool, offset: Int, alloc: IDAllocator) -> [Segment] {
        var segments: [Segment] = []

        func push(_ part: String, at index: Int) {
            if part == " " {
                segments.append(Segment(id: alloc.take("space-\(index)"), string: Segment.nbsp))
            } else {
                segments.append(Segment(id: allocSegmentID(part, index: index, alloc: alloc), string: part))
            }
        }

        guard byWord else {
            for (i, char) in line.enumerated() { push(String(char), at: offset + i) }
            return segments
        }

        var cursor = line.startIndex
        var index = offset

        func pushGap(upTo end: String.Index) {
            while cursor < end {
                push(String(line[cursor]), at: index)
                index += 1
                cursor = line.index(after: cursor)
            }
        }

        line.enumerateSubstrings(in: line.startIndex..<line.endIndex, options: [.byWords, .substringNotRequired]) { _, range, _, _ in
            pushGap(upTo: range.lowerBound)
            let word = String(line[range])
            push(word, at: index)
            index += word.count
            cursor = range.upperBound
        }
        pushGap(upTo: line.endIndex)
        return segments
    }

    static func allocSegmentID(_ part: String, index: Int, alloc: IDAllocator) -> String {
        alloc.has(part) ? alloc.take("\(part)-\(index)") : alloc.take(part)
    }
}
