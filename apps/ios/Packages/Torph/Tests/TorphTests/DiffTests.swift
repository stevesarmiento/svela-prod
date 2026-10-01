import XCTest
@testable import Torph

/// Port of the parts of torph's `diff.test.ts` that pin down ids, splits and edge whitespace.
final class DiffTests: XCTestCase {
    private func ids(_ segments: [Segment]) -> [String] { segments.map(\.id) }
    private func strings(_ segments: [Segment]) -> [String] { segments.map(\.string) }

    func testPersistsMatchingWordsWithSameIDs() {
        let old = Torph.segmentText("Transaction Safe", locale: L)
        let result = diff(old, "Transaction Safe")
        XCTAssertTrue(result.splits.isEmpty)
        XCTAssertEqual(seg(result.segments, "Transaction")?.id, seg(old, "Transaction")?.id)
    }

    func testWordReordering() {
        let old = Torph.segmentText("Transaction Safe", locale: L)
        let result = diff(old, "Processing Transaction")
        XCTAssertTrue(result.splits.isEmpty)
        XCTAssertEqual(seg(result.segments, "Transaction")?.id, seg(old, "Transaction")?.id)
        XCTAssertEqual(seg(result.segments, "Processing")?.id, "Processing")
        XCTAssertNil(seg(result.segments, "Safe"))
    }

    func testIDsConsistentAcrossRepeatedCycles() {
        let prev = Torph.segmentText("Processing Transaction", locale: L)
        let c1 = diff(prev, "Transaction Safe")
        let c2 = diff(c1.segments, "Processing Transaction")
        let c3 = diff(c2.segments, "Transaction Safe")
        let c4 = diff(c3.segments, "Processing Transaction")
        XCTAssertEqual(ids(c1.segments), ids(c3.segments))
        XCTAssertEqual(ids(c2.segments), ids(c4.segments))
    }

    func testSpaceIDsDoNotPersistBetweenDifferentTexts() {
        let old = Torph.segmentText("Transaction Safe", locale: L)
        let segments = diff(old, "Processing Transaction").segments
        let oldSpaces = old.filter(\.isSpace).map(\.id)
        for id in segments.filter(\.isSpace).map(\.id) {
            XCTAssertFalse(oldSpaces.contains(id))
        }
    }

    func testNpmToPnpmSplitsWordIntoCharsAndMorphs() {
        let old = Torph.segmentText("npm i torph", locale: L)
        let result = diff(old, "pnpm add torph")
        let charSegs = result.splits["npm"]
        XCTAssertEqual(charSegs.map(strings), ["n", "p", "m"])
        let pnpmChars = result.segments.filter { !$0.isSpace && $0.string.count == 1 }
        XCTAssertEqual(strings(pnpmChars), ["p", "n", "p", "m"])
        XCTAssertTrue(pnpmChars.contains { $0.string == "n" && $0.id == charSegs?[0].id })
        XCTAssertEqual(seg(result.segments, "torph")?.id, "torph")
        XCTAssertNotNil(seg(result.segments, "add"))
    }

    func testPnpmToNpmReverseMorph() {
        let old = Torph.segmentText("pnpm i torph", locale: L)
        let result = diff(old, "npm i torph")
        XCTAssertNotNil(result.splits["pnpm"])
        let morphed = result.segments.filter { $0.string.count == 1 && $0.id.hasPrefix("pnpm:") }
        XCTAssertEqual(strings(morphed), ["n", "p", "m"])
        XCTAssertTrue(result.segments.contains { $0.string == "i" && $0.id == "i" })
    }

    func testMultiCycleMorph() {
        let initial = Torph.segmentText("npm i torph", locale: L)
        let r1 = diff(initial, "pnpm i torph")
        XCTAssertNotNil(r1.splits["npm"])
        let r2 = diff(r1.segments, "npm i torph")
        let morphed = r2.segments.filter { $0.string.count == 1 && !$0.isSpace && $0.id != "i" }
        XCTAssertEqual(strings(morphed), ["n", "p", "m"])
        XCTAssertNotNil(seg(r2.segments, "i"))
        XCTAssertNotNil(seg(r2.segments, "torph"))
    }

    func testSingleWordToMultiWordPersistsChars() {
        let old = Torph.segmentText("hello", locale: L)
        let result = diff(old, "hello world")
        XCTAssertTrue(result.splits.isEmpty)
        let newCharIDs = result.segments.filter { !$0.isSpace && $0.string.count == 1 }.map(\.id)
        for id in old.map(\.id) { XCTAssertTrue(newCharIDs.contains(id), id) }
        XCTAssertNotNil(seg(result.segments, "world"))
    }

    func testMultiWordToSingleWordPersistsWord() {
        let old = Torph.segmentText("hello world", locale: L)
        let segments = diff(old, "hello").segments
        XCTAssertEqual(seg(segments, "hello")?.id, seg(old, "hello")?.id)
        XCTAssertNil(seg(segments, "world"))
    }

    func testEmptyOldSegmentsUseSegmentText() {
        let result = diff([], "hello world")
        XCTAssertTrue(result.splits.isEmpty)
        XCTAssertFalse(result.segments.isEmpty)
    }

    func testRepeatedWordKeepsIdentityOnFirstOccurrence() {
        let old = Torph.segmentText("hello world", locale: L)
        let segments = diff(old, "hello there hello").segments
        let hellos = segments.filter { $0.string == "hello" }
        XCTAssertEqual(hellos.count, 2)
        XCTAssertEqual(hellos[0].id, seg(old, "hello")?.id)
        XCTAssertNotEqual(hellos[1].id, seg(old, "hello")?.id)
    }

    func testEdgeWhitespaceMatchesInitialRender() {
        let cases = ["\nHello world", " Hello world", "Hello world\n", "Hello world ", "\n\nHello world", "Hello world\n\n", "\n  Hello world  \n", "   "]
        for value in cases {
            let old = Torph.segmentText("Hello world", locale: L)
            let segments = diff(old, value).segments
            XCTAssertEqual(render(segments), render(Torph.segmentText(value, locale: L)), value.debugDescription)
            XCTAssertEqual(Set(ids(segments)).count, segments.count, "duplicate ids for \(value.debugDescription)")
        }
    }

    func testTrailingNewlineStableAcrossRepeatedMorphs() {
        var current = Torph.segmentText("a\nb\n", locale: L)
        for next in ["a\nc\n", "a\nd\n", "a\nb\n"] {
            current = diff(current, next).segments
            XCTAssertEqual(render(current), next)
            XCTAssertEqual(Set(ids(current)).count, current.count)
        }
    }

    func testNumbersOffFallsBackToCharacterMorph() {
        let old = Torph.segmentText("$1,234", locale: L, numbers: false)
        XCTAssertTrue(old.allSatisfy { $0.kind == nil })
        let result = Torph.diffSegments(old, newText: "$1,834", locale: L, options: DiffOptions(numbers: false))
        XCTAssertTrue(result.segments.allSatisfy { $0.kind == nil })
        XCTAssertEqual(render(result.segments), "$1,834")
    }

    func testLCSTiesGoToTheEarliestMatch() {
        let (a, b) = LCS.indices(["a"], ["a", "b", "a"])
        XCTAssertEqual(a, [0])
        XCTAssertEqual(b, [0])
        let (c, d) = LCS.indices(["a", "b", "c"], ["a", "c"])
        XCTAssertEqual(c, [0, 2])
        XCTAssertEqual(d, [0, 1])
    }
}
