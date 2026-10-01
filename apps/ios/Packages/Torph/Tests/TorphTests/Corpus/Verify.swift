import Foundation
import XCTest
@testable import Torph

// Ports of torph's `packages/test-cases/src/verify.ts` and `number-verify.ts`. Every assertion is
// about *identity*: which segment of the new value came from which segment of the old one.

let L = Locale(identifier: "en")

struct Result {
    var pass: Bool
    var detail: String
}

func combine(_ results: Result...) -> Result {
    Result(pass: results.allSatisfy(\.pass), detail: results.map(\.detail).joined(separator: "; "))
}

func assertPass(_ result: Result, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(result.pass, result.detail, file: file, line: line)
}

func seg(_ segments: [Segment], _ value: String) -> Segment? {
    segments.first { $0.string == value }
}

func render(_ segments: [Segment]) -> String {
    segments.map(\.string).joined().replacingOccurrences(of: Segment.nbsp, with: " ")
}

func diff(_ old: [Segment], _ to: String, cursor: Int? = nil) -> DiffResult {
    Torph.diffSegments(old, newText: to, locale: L, options: DiffOptions(numbers: true, cursorIndex: cursor))
}

// MARK: Text

func verifyWordPersistence(_ from: String, _ to: String, _ word: String) -> Result {
    let old = Torph.segmentText(from, locale: L)
    let segments = diff(old, to).segments
    guard let oldSeg = seg(old, word), let newSeg = seg(segments, word) else {
        return Result(pass: false, detail: "\"\(word)\" missing in \(seg(old, word) == nil ? "old" : "new")")
    }
    let pass = oldSeg.id == newSeg.id
    return Result(pass: pass, detail: pass ? "\"\(word)\" id persists" : "\"\(word)\" id changed: \(oldSeg.id) → \(newSeg.id)")
}

func verifyWordAbsent(_ from: String, _ to: String, _ word: String) -> Result {
    let segments = diff(Torph.segmentText(from, locale: L), to).segments
    let found = seg(segments, word) != nil
    return Result(pass: !found, detail: found ? "\"\(word)\" unexpectedly present" : "\"\(word)\" correctly absent")
}

func verifyCharMorph(_ from: String, _ to: String, _ splitWord: String) -> Result {
    let splits = diff(Torph.segmentText(from, locale: L), to).splits
    let pass = splits[splitWord] != nil
    return Result(pass: pass, detail: pass ? "\"\(splitWord)\" split into chars" : "\"\(splitWord)\" was NOT split (splits: \(splits.keys.sorted()))")
}

func verifyNoMorph(_ from: String, _ to: String) -> Result {
    let splits = diff(Torph.segmentText(from, locale: L), to).splits
    return Result(pass: splits.isEmpty, detail: splits.isEmpty ? "No char splits (correct)" : "Unexpected splits: \(splits.keys.sorted())")
}

func verifyGraphemeMorph(_ from: String, _ to: String, _ shared: [String]) -> Result {
    let oldChars = Torph.segmentText(from, locale: L).map(\.string)
    let newChars = Torph.segmentText(to, locale: L).map(\.string)
    let missing = shared.filter { !oldChars.contains($0) || !newChars.contains($0) }
    return Result(pass: missing.isEmpty, detail: missing.isEmpty ? "Shared chars \(shared) present in both" : "Missing shared chars: \(missing)")
}

func verifyCycleStability(_ a: String, _ b: String, _ word: String) -> Result {
    var prev = Torph.segmentText(a, locale: L)
    guard let originalID = seg(prev, word)?.id else { return Result(pass: false, detail: "\"\(word)\" not found in \"\(a)\"") }
    for i in 0..<4 {
        let segments = diff(prev, i % 2 == 0 ? b : a).segments
        guard let s = seg(segments, word), s.id == originalID else {
            return Result(pass: false, detail: "\"\(word)\" id changed at cycle \(i + 1)")
        }
        prev = segments
    }
    return Result(pass: true, detail: "\"\(word)\" id stable across 4 cycles")
}

/// Where each segment of `to` came from in `from`, by index, through the whole text pipeline.
func textAlignment(_ from: String, _ to: String) -> [Int?] {
    let old = Torph.segmentText(from, locale: L)
    let segments = diff(old, to).segments
    var positions: [String: Int] = [:]
    for (i, s) in old.enumerated() where positions[s.id] == nil { positions[s.id] = i }
    return segments.map { positions[$0.id] }
}

func verifyTextPlaces(_ from: String, _ to: String, _ pairs: [(Int, Int?)]) -> Result {
    let places = textAlignment(from, to)
    let toChars = Array(to)
    let wrong = pairs.filter { newIndex, oldIndex in newIndex >= places.count || places[newIndex] != oldIndex }
    let detail = wrong.map { newIndex, oldIndex in
        let ch = newIndex < toChars.count ? String(toChars[newIndex]) : "?"
        let came = newIndex < places.count ? (places[newIndex].map(String.init) ?? "nowhere") : "out of range"
        return "\"\(ch)\" at \(newIndex) should come from \(oldIndex.map(String.init) ?? "nowhere"), came from \(came)"
    }.joined(separator: "; ")
    return Result(pass: wrong.isEmpty, detail: wrong.isEmpty ? "\(pairs.count) places held \(renderPlaces(places))" : detail)
}

func verifyKinds(_ value: String, _ expected: [SegmentKind?]) -> Result {
    let kinds = Torph.segmentText(value, locale: L).map(\.kind)
    let pass = kinds == expected
    return Result(pass: pass, detail: pass ? "\(renderKinds(kinds)) as expected" : "expected \(renderKinds(expected)), got \(renderKinds(kinds))")
}

func verifyKindsAfterMorph(_ from: String, _ to: String, _ expected: [SegmentKind?]) -> Result {
    let kinds = diff(Torph.segmentText(from, locale: L), to).segments.map(\.kind)
    let pass = kinds == expected
    return Result(pass: pass, detail: pass ? "\(renderKinds(kinds)) as expected" : "expected \(renderKinds(expected)), got \(renderKinds(kinds))")
}

func renderKinds(_ kinds: [SegmentKind?]) -> String {
    "[" + kinds.map { $0?.rawValue ?? "text" }.joined(separator: ",") + "]"
}

func renderPlaces(_ places: [Int?]) -> String {
    "[" + places.map { $0.map(String.init) ?? "·" }.joined(separator: ",") + "]"
}

// MARK: Numbers

func alignment(_ from: String, _ to: String, cursor: Int? = nil, decimalChar: Character = ".") -> [Int?] {
    let before = NumberSegmenter.segmentNumber(from)
    let after = NumberSegmenter.segmentNumber(to, prevSegments: before, cursorIndex: cursor, decimalChar: decimalChar)
    var positions: [String: Int] = [:]
    for (i, s) in before.enumerated() { positions[s.id] = i }
    return after.map { positions[$0.id] }
}

/// The whole alignment, exactly. Use when every character's origin matters.
func verifyAlignment(_ from: String, _ to: String, _ expected: [Int?], cursor: Int? = nil, decimalChar: Character = ".") -> Result {
    let places = alignment(from, to, cursor: cursor, decimalChar: decimalChar)
    let pass = places == expected
    return Result(pass: pass, detail: pass ? "\(renderPlaces(places)) as expected" : "expected \(renderPlaces(expected)), got \(renderPlaces(places))")
}

/// Individual `(newIndex, oldIndex)` pairs.
func verifyPlaces(_ from: String, _ to: String, _ pairs: [(Int, Int?)], cursor: Int? = nil, decimalChar: Character = ".") -> Result {
    let places = alignment(from, to, cursor: cursor, decimalChar: decimalChar)
    let toChars = Array(to)
    let wrong = pairs.filter { newIndex, oldIndex in places[newIndex] != oldIndex }
    let detail = wrong.map { newIndex, oldIndex in
        "\"\(toChars[newIndex])\" at \(newIndex) should come from \(oldIndex.map(String.init) ?? "nowhere"), came from \(places[newIndex].map(String.init) ?? "nowhere")"
    }.joined(separator: "; ")
    return Result(pass: wrong.isEmpty, detail: wrong.isEmpty ? "\(pairs.count) places held \(renderPlaces(places))" : detail)
}

func verifyPersistedCount(_ from: String, _ to: String, _ minimum: Int, decimalChar: Character = ".") -> Result {
    let places = alignment(from, to, decimalChar: decimalChar)
    let held = places.compactMap { $0 }.count
    return Result(pass: held >= minimum, detail: held >= minimum ? "\(held) of \(places.count) characters persisted" : "only \(held) characters persisted, expected at least \(minimum)")
}

/// Ids address views, so a repeat within one segmentation makes two characters fight over one.
func verifyUniqueIDs(_ values: [String], cursors: [Int?]? = nil, decimalChar: Character = ".") -> Result {
    var prev: [Segment]?
    for (i, value) in values.enumerated() {
        let segments = NumberSegmenter.segmentNumber(value, prevSegments: prev, cursorIndex: cursors?[i], decimalChar: decimalChar)
        let ids = segments.map(\.id)
        if let duplicate = ids.first(where: { id in ids.filter { $0 == id }.count > 1 }) {
            return Result(pass: false, detail: "\"\(value)\" repeats id \(duplicate.debugDescription)")
        }
        prev = segments
    }
    return Result(pass: true, detail: "ids unique across \(values.count) steps")
}

/// A character that never leaves the number must keep one identity across a round trip.
func verifyNumberCycleStability(_ a: String, _ b: String, anchorIndex: Int, decimalChar: Character = ".") -> Result {
    var segments = NumberSegmenter.segmentNumber(a)
    guard anchorIndex < segments.count else { return Result(pass: false, detail: "no character at index \(anchorIndex) of \"\(a)\"") }
    let anchor = segments[anchorIndex]
    for i in 0..<4 {
        let next = i % 2 == 0 ? b : a
        segments = NumberSegmenter.segmentNumber(next, prevSegments: segments, cursorIndex: nil, decimalChar: decimalChar)
        if !segments.contains(where: { $0.id == anchor.id }) {
            return Result(pass: false, detail: "\"\(anchor.string)\" dropped at cycle \(i + 1) (\"\(next)\")")
        }
    }
    let landed = segments.firstIndex { $0.id == anchor.id } ?? -1
    let pass = landed == anchorIndex
    return Result(pass: pass, detail: pass ? "\"\(anchor.string)\" stable at index \(anchorIndex) across 4 cycles" : "\"\(anchor.string)\" returned to index \(landed), not \(anchorIndex)")
}

/// Every character that persists lands on the index it came from — what tabular figures depend on.
func verifyNoLateralShift(_ from: String, _ to: String, minPersisted: Int = 1) -> Result {
    let places = alignment(from, to)
    let held = places.compactMap { $0 }.count
    if held < minPersisted {
        return Result(pass: false, detail: "only \(held) characters persisted, expected at least \(minPersisted)")
    }
    let toChars = Array(to)
    let shifted = places.enumerated().filter { i, origin in origin != nil && origin != i }
    let detail = shifted.map { i, origin in "\"\(toChars[i])\" slides \(origin!) → \(i)" }.joined(separator: "; ")
    return Result(pass: shifted.isEmpty, detail: shifted.isEmpty ? "\(held) characters held their column" : detail)
}
