import XCTest
@testable import Torph

/// Port of torph's `cases.ts`: the word/character pipeline, numbers inside text, multiline, unicode.
final class TextCasesTests: XCTestCase {
    // ── Basics: word persistence, enter, exit, reorder ──

    func testWordReorderAndExit() {
        assertPass(verifyWordPersistence("Transaction Safe", "Processing Transaction", "Transaction"))
    }

    func testSameWordReversedOrder() {
        assertPass(combine(
            verifyWordPersistence("hello world", "world hello", "hello"),
            verifyWordPersistence("hello world", "world hello", "world")
        ))
    }

    func testAddWord() {
        let old = Torph.segmentText("hello", locale: L)
        let segments = diff(old, "hello world").segments
        let newIDs = Set(segments.map(\.id))
        let lost = old.filter { !newIDs.contains($0.id) }
        XCTAssertTrue(lost.isEmpty, "Lost ids: \(lost.map(\.id))")
        XCTAssertNotNil(seg(segments, "world"))
    }

    func testRemoveWord() {
        assertPass(combine(
            verifyWordPersistence("hello world", "hello", "hello"),
            verifyWordAbsent("hello world", "hello", "world")
        ))
    }

    func testDissimilarWordReplacement() {
        assertPass(combine(
            verifyNoMorph("cat and dog", "fish and bird"),
            verifyWordPersistence("cat and dog", "fish and bird", "and")
        ))
    }

    func testResemblanceAcrossASurvivingWord() {
        assertPass(combine(
            verifyNoMorph("Copy Address", "Address Copied"),
            verifyWordPersistence("Copy Address", "Address Copied", "Address")
        ))
    }

    func testMultiWordPersist() {
        assertPass(combine(
            verifyWordPersistence("the quick brown fox", "the slow brown dog", "brown"),
            verifyWordPersistence("the quick brown fox", "the slow brown dog", "the")
        ))
    }

    func testDuplicateWords() {
        let old = Torph.segmentText("the cat and the dog", locale: L)
        let segments = diff(old, "the big and the small").segments
        let oldThes = old.filter { $0.string == "the" }
        let newThes = segments.filter { $0.string == "the" }
        XCTAssertEqual(oldThes.count, 2)
        XCTAssertEqual(newThes.count, 2)
        XCTAssertEqual(oldThes[0].id, newThes[0].id)
        XCTAssertEqual(oldThes[1].id, newThes[1].id)
        XCTAssertNotEqual(newThes[0].id, newThes[1].id)
        XCTAssertEqual(seg(old, "and")?.id, seg(segments, "and")?.id)
    }

    // ── Character morph ──

    func testCharacterMorphAddPrefix() {
        assertPass(verifyCharMorph("npm i torph", "pnpm i torph", "npm"))
    }

    func testCharacterMorphPlusWordSwap() {
        assertPass(combine(
            verifyCharMorph("npm i torph", "pnpm add torph", "npm"),
            verifyWordPersistence("npm i torph", "pnpm add torph", "torph")
        ))
    }

    func testReverseCharacterMorph() {
        assertPass(verifyCharMorph("pnpm i torph", "npm i torph", "pnpm"))
    }

    func testSingleCharacterChange() {
        assertPass(verifyGraphemeMorph("cart", "card", ["c", "a", "r"]))
    }

    func testCaseChange() {
        assertPass(verifyCharMorph("Hello World", "hello world", "Hello"))
    }

    func testPunctuation() {
        let old = Torph.segmentText("Hello, world!", locale: L)
        let segments = diff(old, "Hello world").segments
        let oldIDs = Set(old.map(\.id))
        let persisted = segments.filter { oldIDs.contains($0.id) }
        XCTAssertGreaterThanOrEqual(persisted.count, 4, "Only \(persisted.count) ids persisted")
    }

    // ── Numbers inside text ──

    func testNumbersMorphByPlace() {
        assertPass(verifyTextPlaces("$1,234", "$12,345,678", [(0, 0), (1, nil), (7, nil)]))
    }

    func testNumberInsideASentence() {
        assertPass(verifyTextPlaces("3 unread messages", "13 unread messages", [(0, nil), (1, 0), (3, 2), (5, 4)]))
    }

    func testDigitsAndSymbolsAreToldApart() {
        assertPass(verifyKinds("$1,234", [.symbol, .digit, .symbol, .digit, .digit, .digit]))
    }

    func testVersionStringsStayText() {
        assertPass(verifyKinds("v1.2.3", [SegmentKind?](repeating: nil, count: 6)))
    }

    func testTwoNumbersOneSentence() {
        assertPass(verifyTextPlaces("2 of 10 done", "2 of 15 done", [(0, 0), (4, 4), (5, nil), (7, 7)]))
    }

    func testEmptyingANumberToItsAffix() {
        assertPass(combine(
            verifyTextPlaces("$4", "$", [(0, 0)]),
            verifyTextPlaces("$", "$420", [(0, 0)])
        ))
    }

    func testANumberNeverClaimsAWord() {
        assertPass(combine(
            verifyTextPlaces("5 items", "five items", [(0, nil), (2, 2)]),
            verifyWordPersistence("5 items", "five items", "items")
        ))
    }

    func testAffixesHoldWhileDigitsChurn() {
        assertPass(verifyTextPlaces("(1,234)", "(5,678)", [(0, 0), (2, 2), (6, 6)]))
    }

    func testADigitPushedIntoTheMiddle() {
        assertPass(verifyTextPlaces("123,456", "1,234,576", [(0, 0), (2, 1), (3, 2), (4, 4), (6, 5), (8, 6), (7, nil)]))
    }

    func testANumberHoldsAcrossANewLine() {
        assertPass(combine(
            verifyTextPlaces("1,234", "Total\n1,234", [(2, 0), (3, 1), (4, 2), (5, 3), (6, 4)]),
            verifyKindsAfterMorph("1,234", "Total\n1,234", [nil, nil, .digit, .symbol, .digit, .digit, .digit])
        ))
    }

    func testANumberChangesAsALineArrives() {
        assertPass(verifyTextPlaces("1,234", "Total\n5,678", [(2, nil), (3, 1)]))
    }

    func testANumberOnAMiddleLineUpdates() {
        assertPass(combine(
            verifyTextPlaces("a\n1,234\nb", "a\n5,678\nb", [(0, 0), (1, 1), (3, 3), (7, 7), (8, 8)]),
            verifyKindsAfterMorph("a\n1,234\nb", "a\n5,678\nb", [nil, nil, .digit, .symbol, .digit, .digit, .digit, nil, nil])
        ))
    }

    func testANumberSwapsLinesWithItsLabel() {
        assertPass(verifyTextPlaces("text\n1,234", "1,234\ntext", [(0, 2), (1, 3), (4, 6), (6, 0)]))
    }

    func testDatesStayText() {
        assertPass(verifyKinds("2024-01-01", [SegmentKind?](repeating: nil, count: 10)))
    }

    func testLongWordCharMorph() {
        assertPass(verifyGraphemeMorph("abcdefghijklmnop", "abcmnopqrstuvwx", ["a", "b", "c", "m", "n", "o", "p"]))
    }

    // ── Multiline ──

    func testMultilineBasic() {
        assertPass(verifyWordPersistence("hello\nworld", "hello\nuniverse", "hello"))
    }

    func testMultilineAddLine() {
        assertPass(combine(
            verifyWordPersistence("hello world\ngoodbye", "hello world\ngoodbye\nfarewell", "hello"),
            verifyWordPersistence("hello world\ngoodbye", "hello world\ngoodbye\nfarewell", "goodbye")
        ))
    }

    func testMultilineRemoveLine() {
        let from = "hello world\nfoo bar\ngoodbye moon"
        let to = "hello world\ngoodbye moon"
        assertPass(combine(
            verifyWordPersistence(from, to, "hello"),
            verifyWordPersistence(from, to, "goodbye"),
            verifyWordAbsent(from, to, "foo")
        ))
    }

    func testMultilineReorder() {
        assertPass(combine(
            verifyWordPersistence("alpha bravo\ncharlie delta", "charlie delta\nalpha bravo", "alpha"),
            verifyWordPersistence("alpha bravo\ncharlie delta", "charlie delta\nalpha bravo", "charlie")
        ))
    }

    func testMultilineWithEdits() {
        let from = "the quick brown fox\njumps over the lazy dog"
        let to = "the slow red fox\nleaps over the happy cat"
        assertPass(combine(
            verifyWordPersistence(from, to, "the"),
            verifyWordPersistence(from, to, "fox"),
            verifyWordPersistence(from, to, "over")
        ))
    }

    func testMultilineToSingleLine() {
        assertPass(combine(
            verifyWordPersistence("hello\nworld", "hello world", "hello"),
            verifyWordPersistence("hello\nworld", "hello world", "world"),
            verifyWordPersistence("hello world", "hello\nworld", "hello"),
            verifyWordPersistence("hello world", "hello\nworld", "world")
        ))
    }

    func testEmptyLines() {
        assertPass(combine(
            verifyWordPersistence("hello\n\nworld", "hello\nworld", "hello"),
            verifyWordPersistence("hello\n\nworld", "hello\nworld", "world")
        ))
    }

    func testMultilineEmptyTransition() {
        let out = diff(Torph.segmentText("hello\nworld", locale: L), "")
        let back = diff([], "foo\nbar")
        XCTAssertEqual(out.segments.count, 0)
        XCTAssertNotNil(seg(back.segments, "foo"))
        XCTAssertNotNil(seg(back.segments, "bar"))
        XCTAssertEqual(back.segments.filter(\.isNewline).count, 1)
    }

    // ── Edge cases ──

    func testEmptyToText() {
        let segments = diff([], "hello world").segments
        let back = diff(Torph.segmentText("hello world", locale: L), "")
        XCTAssertNotNil(seg(segments, "hello"))
        XCTAssertEqual(back.segments.count, 0)
    }

    func testSingleCharacter() {
        assertPass(verifyWordAbsent("a", "b", "a"))
    }

    func testCompleteReplacement() {
        let old = Torph.segmentText("abcdef", locale: L)
        let result = diff(old, "xyz")
        XCTAssertEqual(render(result.segments), "xyz")
        XCTAssertTrue(result.splits.isEmpty)
        let oldIDs = Set(old.map(\.id))
        XCTAssertTrue(result.segments.filter { oldIDs.contains($0.id) }.isEmpty)
    }

    func testWhitespaceNormalization() {
        let segments = diff(Torph.segmentText("hello world", locale: L), "hello  world").segments
        XCTAssertEqual(render(segments), "hello  world")
        assertPass(combine(
            verifyWordPersistence("hello world", "hello  world", "hello"),
            verifyWordPersistence("hello world", "hello  world", "world")
        ))
    }

    // ── Unicode & i18n ──

    func testEmoji() {
        assertPass(verifyWordPersistence("Hello 👋", "Goodbye 👋", "👋"))
    }

    func testCompoundEmoji() {
        assertPass(verifyWordPersistence("Hello 👨‍👩‍👧‍👦", "Goodbye 👨‍👩‍👧‍👦", "👨‍👩‍👧‍👦"))
    }

    func testUnicodeAccents() {
        assertPass(verifyGraphemeMorph("café", "cafe", ["c", "a", "f"]))
    }

    func testRTLArabic() {
        assertPass(verifyWordPersistence("مرحبا بالعالم", "مرحبا يا صديقي", "مرحبا"))
    }

    func testRTLHebrew() {
        assertPass(verifyWordPersistence("שלום עולם", "שלום חברים", "שלום"))
    }

    // ── Stress & stability ──

    func testLongSentenceOverlap() {
        let from = "the quick brown fox jumps over the lazy dog"
        let to = "the quick red fox leaps over the happy cat"
        assertPass(combine(
            verifyWordPersistence(from, to, "quick"),
            verifyWordPersistence(from, to, "fox"),
            verifyWordPersistence(from, to, "over")
        ))
    }

    func testLongParagraph() {
        let from = "The quick brown fox jumps over the lazy dog while the sun sets behind the distant mountains"
        let to = "The slow gray wolf runs under the bright moon while the rain falls across the nearby valleys"
        assertPass(combine(
            verifyWordPersistence(from, to, "while"),
            verifyWordPersistence(from, to, "the")
        ))
    }

    func testMultiCycleStability() {
        assertPass(verifyCycleStability("Transaction Safe", "Processing Transaction", "Transaction"))
    }
}
