import Foundation

/// Ports of the pure helpers in `hooks/use-coingecko-chart-data.ts`, `token-page-client.tsx` (bucketizeOhlcv),
/// `lib/aligned-price.ts`, `hooks/use-chart-instance/utils.ts`.
public struct ParsedChartData: Sendable, Hashable {
  public var line: [TimePoint]
  public var volume: [TimePoint]
  public var ohlc: [OHLCVBar]
  public var marketCap: [TimePoint]
  public static let empty = ParsedChartData(line: [], volume: [], ohlc: [], marketCap: [])
  public init(line: [TimePoint], volume: [TimePoint], ohlc: [OHLCVBar], marketCap: [TimePoint]) {
    self.line = line; self.volume = volume; self.ohlc = ohlc; self.marketCap = marketCap
  }
}

public enum ChartSeries {
  public static let latestPointUpsertWindowSeconds = 5 * 60
  public static let ohlcSupportedDays: Set<String> = ["1", "7", "14", "30", "90", "180", "365", "max"]

  /// Raw market-chart input (time may be seconds or ms).
  public struct RawPoint: Sendable, Hashable { public var time: Double; public var value: Double; public init(time: Double, value: Double) { self.time = time; self.value = value } }
  public struct RawOHLC: Sendable, Hashable {
    public var timestampMs: Double; public var open: Double; public var high: Double; public var low: Double; public var close: Double
    public init(timestampMs: Double, open: Double, high: Double, low: Double, close: Double) { self.timestampMs = timestampMs; self.open = open; self.high = high; self.low = low; self.close = close }
  }

  /// `pickMarketChartBucketSeconds`
  public static func marketChartBucketSeconds(scale: TimeScale, prices: [RawPoint]) -> Int {
    switch scale {
    case .d30: return 4 * 3600
    case .max: return 24 * 3600
    case .y2:
      let ts = prices.map(\.time).filter { $0.isFinite }
      guard ts.count >= 2, let lo = ts.min(), let hi = ts.max() else { return 24 * 3600 }
      let spanDays = (hi - lo) / (24 * 3600)
      return spanDays > 900 ? 30 * 24 * 3600 : 24 * 3600
    default: return 3600
    }
  }

  /// `bucketizeMarketChart`: price → OHLC per bucket, volume summed, market cap last-per-bucket.
  public static func bucketizeMarketChart(prices: [RawPoint], volumes: [RawPoint], marketCaps: [RawPoint], bucketSeconds: Int) -> ParsedChartData? {
    let pts = prices.compactMap { p -> (Int, Double)? in
      guard p.time.isFinite, p.value.isFinite, p.value > 0 else { return nil }
      return (Int(p.time.rounded(.down)), p.value)
    }.sorted { $0.0 < $1.0 }
    guard pts.count >= 2 else { return nil }
    let bucket = max(60, bucketSeconds)
    var bars: [Int: OHLCVBar] = [:]
    for (t, v) in pts {
      let start = (t / bucket) * bucket
      if var b = bars[start] { b.high = max(b.high, v); b.low = min(b.low, v); b.close = v; bars[start] = b }
      else { bars[start] = OHLCVBar(time: start, open: v, high: v, low: v, close: v) }
    }
    var vols: [Int: Double] = [:]
    for p in volumes where p.time.isFinite && p.value.isFinite && p.value >= 0 {
      let start = (Int(p.time.rounded(.down)) / bucket) * bucket
      vols[start, default: 0] += p.value
    }
    var mcaps: [Int: Double] = [:]
    for p in marketCaps.filter({ $0.time.isFinite && $0.value.isFinite && $0.value > 0 }).sorted(by: { $0.time < $1.time }) {
      mcaps[(Int(p.time.rounded(.down)) / bucket) * bucket] = p.value
    }
    let ohlc = bars.keys.sorted().map { k -> OHLCVBar in var b = bars[k]!; b.volume = vols[k] ?? 0; return b }
    return ParsedChartData(
      line: ohlc.map { TimePoint(epochSeconds: $0.time, value: $0.close) },
      volume: ohlc.map { TimePoint(epochSeconds: $0.time, value: $0.volume) },
      ohlc: ohlc,
      marketCap: mcaps.keys.sorted().map { TimePoint(epochSeconds: $0, value: mcaps[$0]!) })
  }

  /// `parseOHLCData`
  public static func parseOHLC(_ rows: [RawOHLC]) -> ParsedChartData? {
    guard !rows.isEmpty else { return nil }
    let bars = rows.map { r in
      OHLCVBar(time: Int((r.timestampMs / 1000).rounded(.down)), open: r.open, high: r.high, low: r.low, close: r.close)
    }.sorted { $0.time < $1.time }
    return ParsedChartData(line: bars.map { TimePoint(epochSeconds: $0.time, value: $0.close) },
                           volume: bars.map { TimePoint(epochSeconds: $0.time, value: 0) }, ohlc: bars, marketCap: [])
  }

  /// `parseMarketChartData`
  public static func parseMarketChart(prices: [RawPoint], volumes: [RawPoint], marketCaps: [RawPoint], scale: TimeScale) -> ParsedChartData? {
    bucketizeMarketChart(prices: prices, volumes: volumes, marketCaps: marketCaps, bucketSeconds: marketChartBucketSeconds(scale: scale, prices: prices))
  }

  /// `combineOHLCWithVolume`
  public static func combineOHLCWithVolume(ohlc rows: [RawOHLC], prices: [RawPoint], volumes: [RawPoint], marketCaps: [RawPoint]) -> ParsedChartData? {
    let bars = rows.map { r in OHLCVBar(time: Int((r.timestampMs / 1000).rounded(.down)), open: r.open, high: r.high, low: r.low, close: r.close) }
    guard bars.count >= 2 else { return nil }
    let vol = volumes.map { TimePoint(epochSeconds: TimePoint.normalizeEpochSeconds($0.time), value: $0.value.isFinite ? $0.value : 0) }
    let mcap = marketCaps.compactMap { p -> TimePoint? in
      guard p.time.isFinite, p.value.isFinite, p.value > 0 else { return nil }
      return TimePoint(epochSeconds: Int(p.time.rounded(.down)), value: p.value)
    }.sorted { $0.epochSeconds < $1.epochSeconds }
    return ParsedChartData(line: bars.map { TimePoint(epochSeconds: $0.time, value: $0.close) }, volume: vol, ohlc: bars, marketCap: mcap)
  }

  /// `upsertLatestPricePoint`: update the last bar when within 5 min, else append.
  public static func upsertLatestPrice(_ data: ParsedChartData, latestPrice: Double, atEpochSeconds t: Int) -> ParsedChartData {
    guard latestPrice.isFinite, latestPrice > 0 else { return data }
    guard let last = data.line.last else {
      return ParsedChartData(line: [TimePoint(epochSeconds: t, value: latestPrice)], volume: [TimePoint(epochSeconds: t, value: 0)],
                             ohlc: [OHLCVBar(time: t, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice)], marketCap: data.marketCap)
    }
    var out = data
    if abs(t - last.epochSeconds) <= latestPointUpsertWindowSeconds {
      out.line[out.line.count - 1] = TimePoint(epochSeconds: t, value: latestPrice)
      if let prev = out.ohlc.last {
        let open = prev.open.isFinite && prev.open > 0 ? prev.open : latestPrice
        out.ohlc[out.ohlc.count - 1] = OHLCVBar(time: t, open: open, high: max(prev.high, latestPrice), low: min(prev.low, latestPrice), close: latestPrice, volume: prev.volume)
      }
      return out
    }
    out.line.append(TimePoint(epochSeconds: t, value: latestPrice))
    out.volume.append(TimePoint(epochSeconds: t, value: 0))
    out.ohlc.append(OHLCVBar(time: t, open: latestPrice, high: latestPrice, low: latestPrice, close: latestPrice))
    return out
  }

  /// `bucketizeOhlcv` (token-page-client): sequential bucketing preserving order.
  public static func bucketizeOHLCV(_ points: [OHLCVBar], bucketSeconds: Int) -> [OHLCVBar] {
    guard !points.isEmpty, bucketSeconds > 0 else { return [] }
    var out: [OHLCVBar] = []
    var current: OHLCVBar? = nil
    var currentStart: Int? = nil
    for p in points {
      let start = (p.time / bucketSeconds) * bucketSeconds
      if currentStart == start, var c = current {
        c.high = max(c.high, p.high); c.low = min(c.low, p.low); c.close = p.close; c.volume += p.volume
        current = c
        continue
      }
      if let c = current { out.append(c) }
      currentStart = start
      current = OHLCVBar(time: start, open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume)
    }
    if let c = current { out.append(c) }
    return out
  }

  /// `getAlignedPriceFromChartPoints`: last finite, positive close.
  public static func alignedPrice(_ points: [TimePoint]) -> Double? {
    for p in points.reversed() where p.value.isFinite && p.value > 0 { return p.value }
    return nil
  }

  /// `clampEvenDownsample`: keep ≤ max points, evenly spaced, always including the last.
  public static func downsample(_ points: [TimePoint], max maxPoints: Int) -> [TimePoint] {
    guard maxPoints >= 2, points.count > maxPoints else { return points }
    let step = Double(points.count - 1) / Double(maxPoints - 1)
    return (0..<maxPoints).map { points[Int((Double($0) * step).rounded())] }
  }
}
