import Foundation

/// Equal-weight aggregate math from `use-coingecko-watchlist-aggregate-chart-isolated.ts`
/// and holdings-value math from `use-holdings-value-over-time.ts`.
public enum AggregateSeries {
  /// Per-coin market-chart series (time in epoch seconds, ascending not required).
  public struct Input: Sendable {
    public var byCoin: [String: [TimePoint]]
    /// Coins whose series are being refreshed server-side: stop contributing after their last real point.
    public var warming: Set<String>
    public init(byCoin: [String: [TimePoint]], warming: Set<String> = []) {
      self.byCoin = byCoin; self.warming = warming
    }
  }

  /// Equal-weighted portfolio return (%): each coin normalized to 0% at its first price, then averaged per bucket.
  /// Trailing buckets with no contributors are dropped; mid-series gaps carry the last aggregate forward.
  public static func equalWeightReturnSeries(_ input: Input, scale: TimeScale, rangeEndMs: Int) -> [TimePoint] {
    let valid = input.byCoin.filter { !$0.value.isEmpty }
    guard !valid.isEmpty else { return [] }
    let bucketMs = scale.bucketMs
    let startMs = rangeEndMs - scale.rangeDays * 24 * 60 * 60 * 1000
    let buckets = TimeScale.bucketTimesMs(start: startMs, end: rangeEndMs, bucketMs: bucketMs)
    guard !buckets.isEmpty else { return [] }

    var sum = [Double](repeating: 0, count: buckets.count)
    var count = [Int](repeating: 0, count: buckets.count)

    for (coinId, raw) in valid {
      let series = raw.sorted { $0.epochSeconds < $1.epochSeconds }
      guard let first = series.first, first.value > 0 else { continue }
      let baseline = first.value
      let isWarming = input.warming.contains(coinId)
      let lastRealSec = series[series.count - 1].epochSeconds
      var cursor = 0
      var lastPrice: Double? = nil
      for i in 0..<buckets.count {
        let bucketSec = buckets[i] / 1000
        while cursor < series.count && series[cursor].epochSeconds <= bucketSec {
          lastPrice = series[cursor].value
          cursor += 1
        }
        if isWarming && bucketSec > lastRealSec { continue }
        let price = lastPrice ?? baseline
        sum[i] += (price - baseline) / baseline * 100
        count[i] += 1
      }
    }

    guard let lastActive = count.lastIndex(where: { $0 > 0 }) else { return [] }
    var out: [TimePoint] = []
    out.reserveCapacity(lastActive + 1)
    var lastValue: Double? = nil
    for i in 0...lastActive {
      let sec = buckets[i] / 1000
      if count[i] > 0 {
        let v = sum[i] / Double(count[i])
        lastValue = v
        out.append(TimePoint(epochSeconds: sec, value: v))
      } else {
        out.append(TimePoint(epochSeconds: sec, value: lastValue ?? 0))
      }
    }
    return out
  }

  /// Per-coin % return over the fetched range (earliest → latest point). Skips non-positive baselines.
  public static func changePctByCoinId(_ byCoin: [String: [TimePoint]]) -> [String: Double] {
    var map: [String: Double] = [:]
    for (coinId, series) in byCoin where !series.isEmpty {
      var first = series[0], last = series[0]
      for p in series {
        if p.epochSeconds < first.epochSeconds { first = p }
        if p.epochSeconds > last.epochSeconds { last = p }
      }
      guard first.value.isFinite, first.value > 0, last.value.isFinite else { continue }
      map[coinId] = (last.value - first.value) / first.value * 100
    }
    return map
  }

  /// `pickQuoteIntervalChange`: quote % field matching the interval, with fallbacks (30d → 7d → 24h).
  public static func quoteIntervalChange(scale: TimeScale, change24h: Double?, change7d: Double?, change30d: Double?) -> Double? {
    let v: Double?
    switch scale {
    case .d1: v = change24h
    case .d7: v = change7d ?? change24h
    case .d30, .max: v = change30d ?? change7d ?? change24h
    case .y2: return nil
    }
    return v.flatMap { $0.isFinite ? $0 : nil }
  }

  /// `alignSeriesToSharedTimeAxis`: linear interpolation onto the densest series' time axis; warming series stop at their last real point.
  public static func alignToSharedAxis(_ series: [String: (points: [TimePoint], warming: Bool)]) -> [String: [TimePoint]] {
    guard series.count > 1, let axisSource = series.values.max(by: { $0.points.count < $1.points.count }) else { return series.mapValues(\.points) }
    let axis = Array(Set(axisSource.points.map(\.epochSeconds))).sorted()
    guard !axis.isEmpty else { return series.mapValues(\.points) }
    var out: [String: [TimePoint]] = [:]
    for (id, row) in series {
      let pts = row.points
      if pts.isEmpty { out[id] = pts; continue }
      if pts.count == 1 {
        out[id] = row.warming ? pts : axis.map { TimePoint(epochSeconds: $0, value: pts[0].value) }
        continue
      }
      let first = pts[0], last = pts[pts.count - 1]
      var aligned: [TimePoint] = []
      var cursor = 0
      for t in axis {
        if t <= first.epochSeconds { aligned.append(TimePoint(epochSeconds: t, value: first.value)); continue }
        if row.warming && t > last.epochSeconds { continue }
        if t >= last.epochSeconds { aligned.append(TimePoint(epochSeconds: t, value: last.value)); continue }
        while cursor < pts.count - 2 && pts[cursor + 1].epochSeconds < t { cursor += 1 }
        let l = pts[cursor], r = pts[cursor + 1]
        if r.epochSeconds <= l.epochSeconds { aligned.append(TimePoint(epochSeconds: t, value: l.value)); continue }
        let ratio = Double(t - l.epochSeconds) / Double(r.epochSeconds - l.epochSeconds)
        aligned.append(TimePoint(epochSeconds: t, value: l.value + ratio * (r.value - l.value)))
      }
      out[id] = aligned
    }
    return out
  }

  /// Per-coin % return series from the first positive point (multi-line comparison lines).
  public static func returnSeries(_ points: [TimePoint]) -> [TimePoint] {
    guard let base = points.first(where: { $0.value > 0 })?.value else { return [] }
    return points.map { TimePoint(epochSeconds: $0.epochSeconds, value: ($0.value - base) / base * 100) }
  }

  /// Equal-weight estimate from quotes (used by list rows when chart data is unavailable; marked "≈" in UI).
  public static func equalWeightFromQuotes(_ changePcts: [Double?]) -> Double? {
    let finite = changePcts.compactMap { $0 }.filter { $0.isFinite }
    guard !finite.isEmpty else { return nil }
    return finite.reduce(0, +) / Double(finite.count)
  }

  /// Holdings position for the portfolio value series.
  public struct Position: Sendable, Hashable {
    public var coinId: String
    public var holdings: Double
    public init(coinId: String, holdings: Double) { self.coinId = coinId; self.holdings = holdings }
  }

  /// Portfolio USD value over shared buckets: Σ holdings × forward-filled price. Buckets before a coin's
  /// first price use its first price (keeps the series anchored). Returns [] when no coin has data.
  public static func holdingsValueSeries(positions: [Position], pricesByCoin: [String: [TimePoint]], scale: TimeScale, rangeEndMs: Int) -> [TimePoint] {
    let active = positions.filter { $0.holdings > 0 && !(pricesByCoin[$0.coinId]?.isEmpty ?? true) }
    guard !active.isEmpty else { return [] }
    let startMs = rangeEndMs - scale.rangeDays * 24 * 60 * 60 * 1000
    let buckets = TimeScale.bucketTimesMs(start: startMs, end: rangeEndMs, bucketMs: scale.bucketMs)
    var values = [Double](repeating: 0, count: buckets.count)
    var contributed = [Bool](repeating: false, count: buckets.count)
    for position in active {
      let series = (pricesByCoin[position.coinId] ?? []).sorted { $0.epochSeconds < $1.epochSeconds }
      guard let first = series.first else { continue }
      var cursor = 0
      var last: Double? = nil
      for i in 0..<buckets.count {
        let sec = buckets[i] / 1000
        while cursor < series.count && series[cursor].epochSeconds <= sec {
          last = series[cursor].value; cursor += 1
        }
        let price = last ?? first.value
        guard price.isFinite else { continue }
        values[i] += position.holdings * price
        contributed[i] = true
      }
    }
    return zip(buckets, zip(values, contributed)).compactMap { (ms, vc) in
      vc.1 ? TimePoint(epochSeconds: ms / 1000, value: vc.0) : nil
    }
  }
}
