import XCTest
@testable import Torph

/// Port of torph's `number-cases.ts`. Every assertion is about *place*: which character of the new
/// value came from which character of the old one.
final class NumberCasesTests: XCTestCase {
    // ── Place matching: digits keep their significance ──

    func testCounterTick() {
        assertPass(verifyAlignment("100", "101", [0, 1, nil]))
    }

    func testIntegerGrowsLeft() {
        assertPass(verifyAlignment("99", "199", [nil, 0, 1]))
    }

    func testMismatchedDigitMidNumber() {
        assertPass(verifyAlignment("1,234", "1,834", [0, 1, nil, 3, 4]))
    }

    func testEveryDigitChanges() {
        assertPass(verifyAlignment("1234", "5678", [nil, nil, nil, nil]))
    }

    // ── Group separators ──

    func testSeparatorSlidesUpAMagnitude() {
        assertPass(verifyAlignment("999,999", "1,000,000", [nil, nil, nil, nil, nil, 3, nil, nil, nil]))
    }

    func testSeparatorSlidesBackDown() {
        assertPass(verifyAlignment("12,345", "1,234", [0, nil, 1, 3, 4]))
    }

    func testSeparatorSurvivesARoundTrip() {
        assertPass(verifyNumberCycleStability("9,999", "10,000", anchorIndex: 1))
    }

    // ── Affixes: currency, units, signs ──

    func testCurrencyToMillions() {
        assertPass(verifyPlaces("$999.50", "$1,000,000.00", [(0, 0), (10, nil), (6, nil)]))
    }

    func testTrailingUnitHeld() {
        assertPass(verifyAlignment("1.25 MB", "1.5 MB", [0, 1, nil, 4, 5, 6]))
    }

    func testPercentSignHeld() {
        assertPass(verifyAlignment("0%", "50%", [nil, 0, 1]))
    }

    func testNegativeSignEnters() {
        assertPass(verifyAlignment("5", "-5", [nil, 0]))
    }

    // ── Fractions and the decimal pivot ──

    func testFractionGrowsRight() {
        assertPass(verifyAlignment("1.5", "1.55", [0, 1, 2, nil]))
    }

    func testFixedDecimals() {
        assertPass(verifyPlaces("3.14", "2.72", [(1, 1)]))
    }

    func testFixedWidthClock() {
        assertPass(verifyAlignment("09:59", "10:00", [nil, nil, 2, nil, nil]))
    }

    // ── Locale ──

    func testGermanSeparators() {
        assertPass(verifyAlignment("1.234,56", "12.345,67", [0, 2, nil, 3, 4, nil, 5, nil, nil], decimalChar: ","))
    }

    func testLocaleFormatting() {
        assertPass(verifyPersistedCount("1.234.567,89", "9.876.543,21", 4, decimalChar: ","))
    }

    func testFrenchNarrowSpaces() {
        assertPass(verifyAlignment("1\u{202F}234,56", "12\u{202F}345,67", [0, 2, nil, 3, 4, nil, 5, nil, nil], decimalChar: ","))
    }

    // ── Cursor matching: text input, not a counter ──

    func testCursorInsert() {
        assertPass(verifyAlignment("1234", "12934", [0, 1, nil, 2, 3], cursor: 3))
    }

    func testCursorDelete() {
        assertPass(verifyAlignment("$4.20", "$4.2", [0, 1, 2, 3], cursor: 4))
    }

    func testTypingACurrencyField() {
        assertPass(verifyUniqueIDs(["$", "$2", "$20", "$420", "$4,020", "$4.20"], cursors: [1, 2, 3, 2, 4, 3]))
    }

    func testCursorGrowsASeparator() {
        assertPass(verifyAlignment("123", "1,234", [0, nil, 1, 2, nil], cursor: 5))
    }

    func testCursorInsertBesideTheSameDigit() {
        assertPass(verifyAlignment("1,111", "11,111", [0, nil, 1, 2, 3, 4], cursor: 2))
    }

    // ── Symbols and affixes that are not currency ──

    func testCurrencySymbolSwaps() {
        assertPass(verifyNoLateralShift("$99.00", "€99.00", minPersisted: 5))
    }

    func testDeltaBadge() {
        assertPass(verifyAlignment("+2.4%", "\u{2212}0.8%", [nil, nil, 2, nil, 4]))
    }

    func testCompactSuffix() {
        assertPass(verifyAlignment("999K", "1.2K", [nil, nil, nil, 3]))
    }

    func testScoreline() {
        assertPass(verifyNoLateralShift("0 - 0", "1 - 0", minPersisted: 4))
    }

    // ── Tabular figures ──

    func testTabularDigitsHoldTheirColumn() {
        assertPass(verifyNoLateralShift("1,234", "9,876"))
    }

    func testTabularCurrencyCounter() {
        assertPass(verifyNoLateralShift("$1,234.50", "$9,876.50", minPersisted: 4))
    }

    func testTabularWidthChange() {
        assertPass(verifyPlaces("9,999", "10,000", [(2, 1), (0, nil)]))
    }

    // ── Edges ──

    func testRepeatedDigitShrinks() {
        assertPass(verifyAlignment("1111", "111", [1, 2, 3]))
    }

    func testEmptyAndBack() {
        assertPass(combine(verifyAlignment("", "42", [nil, nil]), verifyUniqueIDs(["", "42", ""])))
    }

    // ── Invariants ──

    func testIDsStayUnique() {
        assertPass(verifyUniqueIDs(["1", "11", "111", "1,111", "11,111", "1,111", "111", "11", "1"]))
    }

    // ── Word classification (number.ts) ──

    func testIsNumericWord() {
        for word in ["1", "1,234", "$1,234.56", "-5", "+2.4%", "(1,234)", "999K"[...].dropLast().description, "12%", "0.5", "1\u{202F}234,56", "#42"] {
            XCTAssertTrue(NumberSegmenter.isNumericWord(word), word)
        }
        for word in ["COVID-19", "2024-01-01", "v1.2.3", "abc", "$", "", "1.2K", "five", "09:59"] {
            XCTAssertFalse(NumberSegmenter.isNumericWord(word), word)
        }
    }
}
