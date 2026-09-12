import Testing
@testable import AggrCore

@Suite struct UsdFormatTests {
  @Test func precisionLadder() {
    #expect(UsdFormat.maximumFractionDigits(for: 12345) == 2)
    #expect(UsdFormat.maximumFractionDigits(for: 96.123) == 3)
    #expect(UsdFormat.maximumFractionDigits(for: 0.5) == 4)
    #expect(UsdFormat.maximumFractionDigits(for: 0.05) == 5)
    #expect(UsdFormat.maximumFractionDigits(for: 0.005) == 6)
    #expect(UsdFormat.maximumFractionDigits(for: 0.0005) == 7)
    #expect(UsdFormat.maximumFractionDigits(for: 0) == 3)
  }

  @Test func priceStrings() {
    #expect(UsdFormat.price(43250.32) == "$43,250.32")
    #expect(UsdFormat.price(96.1234) == "$96.123")
    #expect(UsdFormat.price(0.000123456) == "$0.0001235")
    #expect(UsdFormat.price(1) == "$1.00")
    #expect(UsdFormat.price(.nan) == "$0.00")
  }

  @Test func largeNumbers() {
    #expect(UsdFormat.large(1_500_000_000_000) == "1.50T")
    #expect(UsdFormat.large(850_000_000_000) == "850.00B")
    #expect(UsdFormat.large(2_500_000) == "2.50M")
    #expect(UsdFormat.large(1234) == "1.23K")
    #expect(UsdFormat.large(12.345) == "12.35")
    #expect(UsdFormat.large(-2_000_000) == "-2.00M")
    #expect(UsdFormat.largeUsd(-2_000_000) == "-$2.00M")
  }

  @Test func signedHelpers() {
    #expect(UsdFormat.signedPercent(3.2149) == "+3.21%")
    #expect(UsdFormat.signedPercent(-0.4) == "-0.40%")
    #expect(UsdFormat.signedPercent(0) == "0.00%")
    #expect(UsdFormat.signedPercent(.nan) == "N/A")
    #expect(abs((UsdFormat.usdMove(priceUsd: 110, percentChange: 10) ?? 0) - 10) < 1e-9)
    #expect(UsdFormat.usdMove(priceUsd: nil, percentChange: 10) == nil)
  }
}
