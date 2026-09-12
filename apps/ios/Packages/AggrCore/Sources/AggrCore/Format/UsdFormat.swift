import Foundation

/// Ports `apps/app/src/lib/format-usd.ts` and `packages/ui/src/utils/format-numbers.ts`.
public enum UsdFormat {
  /// Precision ladder from `getUsdPriceFormatOptions`.
  public static func maximumFractionDigits(for value: Double) -> Int {
    let abs = Swift.abs(value)
    if abs >= 1_000 { return 2 }
    if abs > 0 && abs < 1 {
      if abs >= 0.1 { return 4 }
      if abs >= 0.01 { return 5 }
      if abs >= 0.001 { return 6 }
      return 7
    }
    return 3
  }

  /// `formatUsdPrice`: currency USD, min 2 fraction digits, max per ladder. Non-finite → $0.00.
  public static func price(_ value: Double, locale: Locale = Locale(identifier: "en_US")) -> String {
    let safe = value.isFinite ? value : 0
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .currency
    formatter.currencyCode = "USD"
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = maximumFractionDigits(for: safe)
    return formatter.string(from: NSNumber(value: safe)) ?? "$0.00"
  }

  /// `formatLargeNumber`: T/B/M/K with 2 decimals; sign preserved.
  public static func large(_ num: Double) -> String {
    let abs = Swift.abs(num)
    if abs >= 1e12 { return String(format: "%.2fT", num / 1e12) }
    if abs >= 1e9 { return String(format: "%.2fB", num / 1e9) }
    if abs >= 1e6 { return String(format: "%.2fM", num / 1e6) }
    if abs >= 1e3 { return String(format: "%.2fK", num / 1e3) }
    return String(format: "%.2f", num)
  }

  /// "$1.23B" style used in table cells (`$` + `formatLargeNumber`).
  public static func largeUsd(_ num: Double) -> String {
    num < 0 ? "-$" + large(-num) : "$" + large(num)
  }

  /// Signed percent with 2 decimals, e.g. "+3.21%" / "-0.40%".
  public static func signedPercent(_ pct: Double, fractionDigits: Int = 2) -> String {
    guard pct.isFinite else { return "N/A" }
    let sign = pct > 0 ? "+" : (pct < 0 ? "-" : "")
    return sign + String(format: "%.\(fractionDigits)f%%", Swift.abs(pct))
  }

  /// Signed USD move, e.g. "+$12.30" / "-$0.0041".
  public static func signedPrice(_ delta: Double) -> String {
    guard delta.isFinite else { return "—" }
    let sign = delta > 0 ? "+" : (delta < 0 ? "-" : "")
    return sign + price(Swift.abs(delta))
  }

  /// Web clamps absurd percent changes to ±9999 in badges.
  public static func clampPercent(_ pct: Double) -> Double {
    min(9999, max(-9999, pct))
  }

  /// USD move derived from price and percent change: `price - price / (1 + pct/100)`.
  public static func usdMove(priceUsd: Double?, percentChange: Double?) -> Double? {
    guard let priceUsd, let percentChange, priceUsd.isFinite, percentChange.isFinite else { return nil }
    let denominator = 1 + percentChange / 100
    guard denominator != 0 else { return nil }
    return priceUsd - priceUsd / denominator
  }
}
