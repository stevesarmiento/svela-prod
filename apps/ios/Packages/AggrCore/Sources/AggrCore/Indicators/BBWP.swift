import Foundation

/// Port of `bbwp.ts` — Bollinger Band Width Percentile.
public enum BBWP {
  public enum MAType: String, Sendable, Codable { case SMA, EMA, WMA, RMA, HMA, VWMA }
  public enum PriceSource: String, Sendable, Codable { case close, open, high, low, hlc3 }

  public struct Config: Sendable, Hashable {
    public var priceSource: PriceSource = .close
    public var basisType: MAType = .SMA
    public var basisLength = 7
    public var lookback = 100
    public var maType: MAType = .SMA
    public var maLength = 5
    public var extremeHigh = 98.0
    public var extremeLow = 2.0
    public init() {}
    public static let `default` = Config()
  }

  public struct Result: Sendable, Hashable {
    public var bbwp: [TimePoint]
    public var ma: [TimePoint]
    public var extremeHigh: Double
    public var extremeLow: Double
    public static let empty = Result(bbwp: [], ma: [], extremeHigh: 98, extremeLow: 2)
    public var latest: Double? { bbwp.last?.value }
  }

  static func ma(_ type: MAType, _ values: [Double], _ len: Int, _ volumes: [Double]) -> [Double] {
    switch type {
    case .SMA: TechnicalIndicators.sma(values, len)
    case .EMA: TechnicalIndicators.ema(values, len)
    case .WMA: TechnicalIndicators.wma(values, len)
    case .RMA: TechnicalIndicators.rma(values, len)
    case .HMA: TechnicalIndicators.hullMA(values, len)
    case .VWMA: TechnicalIndicators.vwma(values, volumes, len)
    }
  }

  /// Pine `array.binary_search_rightmost` semantics.
  static func binarySearchRightmost(_ sorted: [Double], _ value: Double) -> Int {
    var lo = 0, hi = sorted.count
    while lo < hi { let mid = (lo + hi) >> 1; if sorted[mid] <= value { lo = mid + 1 } else { hi = mid } }
    let upper = lo
    let idx = upper - 1
    if idx >= 0, sorted[idx] == value { return idx }
    return upper
  }

  static func rollingPercentileRank(_ values: [Double?], bbwLen: Int, lookback: Int) -> [Double?] {
    var raw: [Double] = [], sorted: [Double] = []
    var out = [Double?](repeating: nil, count: values.count)
    for i in 0..<values.count {
      guard i >= bbwLen, let v = values[i], v.isFinite else { continue }
      let idx = binarySearchRightmost(sorted, v)
      out[i] = sorted.isEmpty ? nil : Double(idx) * 100 / Double(sorted.count)
      raw.append(v)
      sorted.insert(v, at: idx)
      if raw.count > lookback {
        let old = raw.removeFirst()
        let r = binarySearchRightmost(sorted, old)
        if r >= 0, r < sorted.count { sorted.remove(at: r) }
      }
    }
    return out
  }

  static func movingAverageNullable(_ type: MAType, _ values: [Double?], _ len: Int, _ volumes: [Double]) -> [Double?] {
    guard len > 0 else { return [Double?](repeating: nil, count: values.count) }
    let dense = values.map { ($0 ?? .nan).isFinite ? $0! : 0 }
    let computed = ma(type, dense, len, volumes)
    var out = [Double?](repeating: nil, count: values.count)
    var valid = 0
    for i in 0..<values.count {
      if let v = values[i], v.isFinite { valid += 1 }
      guard valid >= len, i < computed.count, computed[i].isFinite else { continue }
      out[i] = computed[i]
    }
    return out
  }

  public static func calculate(_ data: [OHLCVBar], config c: Config = .default) -> Result {
    guard !data.isEmpty else { return .empty }
    let basisLength = max(1, c.basisLength), lookback = max(10, c.lookback), maLength = max(1, c.maLength)
    let extremeHigh = min(100, max(50, c.extremeHigh)), extremeLow = min(50, max(0, c.extremeLow))
    let volumes = data.map { $0.volume.isFinite ? $0.volume : 0 }
    let price: [Double] = switch c.priceSource {
    case .open: data.map(\.open); case .high: data.map(\.high); case .low: data.map(\.low); case .hlc3: data.map(\.hlc3); case .close: data.map(\.close)
    }
    let basis = ma(c.basisType, price, basisLength, volumes)
    let dev = TechnicalIndicators.stdev(price, basisLength)
    var bbw = [Double?](repeating: nil, count: data.count)
    for i in 0..<data.count {
      let b = basis[i], d = dev[i]
      guard b.isFinite, d.isFinite, b != 0 else { continue }
      bbw[i] = 2 * d / b
    }
    let bbwp = rollingPercentileRank(bbw, bbwLen: basisLength, lookback: lookback).map { $0.map { min(100, max(0, $0)) } }
    let maValues = movingAverageNullable(c.maType, bbwp, maLength, volumes).map { $0.map { min(100, max(0, $0)) } }
    var series: [TimePoint] = [], maSeries: [TimePoint] = []
    for i in 0..<data.count {
      if let v = bbwp[i], v.isFinite { series.append(TimePoint(epochSeconds: data[i].time, value: v)) }
      if let m = maValues[i], m.isFinite { maSeries.append(TimePoint(epochSeconds: data[i].time, value: m)) }
    }
    return Result(bbwp: series, ma: maSeries, extremeHigh: extremeHigh, extremeLow: extremeLow)
  }
}
