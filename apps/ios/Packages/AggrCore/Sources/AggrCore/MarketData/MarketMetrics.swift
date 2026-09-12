import Foundation

/// Port of the pure helpers in `watchlists/[id]/market-metrics.tsx`.
public enum MarketMetrics {
  public static func fdvUsd(priceUsd: Double?, maxSupply: Double?) -> Double? {
    guard let p = priceUsd, p.isFinite, p > 0, let m = maxSupply, m.isFinite, m > 0 else { return nil }
    let v = p * m
    return v.isFinite ? v : nil
  }

  public static func floatPct(circulatingSupply: Double?, maxSupply: Double?) -> Double? {
    guard let c = circulatingSupply, c.isFinite, c > 0, let m = maxSupply, m.isFinite, m > 0 else { return nil }
    let v = c / m * 100
    return v.isFinite ? v : nil
  }

  public static func turnoverPct(volume24hUsd: Double?, marketCapUsd: Double?) -> Double? {
    guard let v = volume24hUsd, v.isFinite, v > 0, let m = marketCapUsd, m.isFinite, m > 0 else { return nil }
    let r = v / m * 100
    return r.isFinite ? r : nil
  }

  static func cleaned(_ bars: [OHLCVBar], requireOpen: Bool) -> [OHLCVBar] {
    bars.filter { b in
      b.high.isFinite && b.low.isFinite && b.close.isFinite && b.high > 0 && b.low > 0 && b.close > 0
        && (!requireOpen || (b.open.isFinite && b.open > 0))
    }.sorted { $0.time < $1.time }
  }

  /// Where the last close sits in the low→high range of the last `days` daily bars (0…100).
  public static func rangePositionPct(dailyOhlcv: [OHLCVBar], days: Int) -> Double? {
    let c = cleaned(dailyOhlcv, requireOpen: false)
    guard days > 0, c.count >= days else { return nil }
    let window = c.suffix(days)
    let low = window.map(\.low).min()!, high = window.map(\.high).max()!
    let lastClose = window.last!.close
    let denom = high - low
    guard denom > 0 else { return nil }
    let pct = (lastClose - low) / denom * 100
    guard pct.isFinite else { return nil }
    return max(0, min(100, pct))
  }

  /// 14-day ATR as % of last close (needs 15 daily bars).
  public static func atrPct14d(dailyOhlcv: [OHLCVBar]) -> Double? {
    let c = cleaned(dailyOhlcv, requireOpen: true)
    guard c.count >= 15 else { return nil }
    let window = Array(c.suffix(15))
    var trSum = 0.0
    for i in 1..<window.count {
      let prevClose = window[i - 1].close, high = window[i].high, low = window[i].low
      let tr = max(high - low, abs(high - prevClose), abs(low - prevClose))
      guard tr.isFinite else { return nil }
      trSum += tr
    }
    let atr = trSum / 14
    let lastClose = window.last!.close
    guard atr.isFinite, atr > 0, lastClose > 0 else { return nil }
    let pct = atr / lastClose * 100
    return pct.isFinite ? pct : nil
  }

  /// `deriveUsdMoveFromPercentChange`
  public static func usdMove(priceUsd: Double, percentChange: Double) -> Double? {
    guard priceUsd.isFinite, priceUsd > 0, percentChange.isFinite else { return nil }
    let denom = 1 + percentChange / 100
    guard denom.isFinite, denom > 0 else { return nil }
    let delta = priceUsd - priceUsd / denom
    return delta.isFinite ? delta : nil
  }
}
