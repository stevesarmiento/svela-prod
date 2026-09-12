import Foundation
import Testing
@testable import AggrCore

@Suite struct HoldingsAmountTests {
  @Test(arguments: [("en_US", "1.5", 1.5), ("fr_FR", "1,5", 1.5), ("de_DE", "1,5", 1.5),
                    ("en_US", "1,234.56", 1234.56), ("de_DE", "1.234,56", 1234.56),
                    ("fr_FR", "1\u{202F}234,56", 1234.56), ("fr_FR", "0,000000001", 0.000000001)])
  func localizedQuantity(_ locale: String, _ raw: String, _ expected: Double) throws {
    #expect(try HoldingsAmount.parse(raw, locale: Locale(identifier: locale)) == expected)
  }
  @Test(arguments: ["1.5garbage", "1,5", "1,23,456", "1.2.3", "-1", "NaN", "Infinity", "1/2", "."])
  func rejectsMalformedQuantity(_ raw: String) {
    #expect(throws: HoldingsAmount.ParseError.self) { try HoldingsAmount.parse(raw, locale: Locale(identifier: "en_US")) }
  }
  @Test func clearingAndZero() throws {
    #expect(try HoldingsAmount.parse("  ") == nil)
    #expect(try HoldingsAmount.parse("0") == 0)
  }
  @Test(arguments: ["en_US", "fr_FR", "de_DE"])
  func editingDoesNotRoundExistingHoldings(_ identifier: String) throws {
    let locale = Locale(identifier: identifier)
    for value in [1.5, 0.00000000000000000001, 123456.123456789] {
      #expect(try HoldingsAmount.parse(HoldingsAmount.format(value, locale: locale), locale: locale) == value)
    }
  }
}
