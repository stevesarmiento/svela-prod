import Foundation

/// Everything the token page's indicator section needs, computed off the main actor in one pass
/// (`token-indicators-section.tsx`): live series from the full-resolution bars plus the coarser
/// "explain" series sent to `/api/analyze-indicator`.
public struct IndicatorBundle: Sendable, Hashable {
  public var bars: [OHLCVBar]
  public var marketVision: MarketVisionResult
  public var bollinger: BollingerBands.Result
  public var bbwp: BBWP.Result
  public var rsiDivergences: RsiDivergences.Result

  public var explainBars: [OHLCVBar]
  public var explainMarketVision: MarketVisionResult
  public var explainBollinger: BollingerBands.Result
  public var explainBBWP: BBWP.Result
  public var explainRsiDivergences: RsiDivergences.Result

  public static let explainMaxBars = 180

  /// `explainSpec`: 30d → 1h buckets × 168; max → 1d × 30; 2y → 1d × 90; else 1d × 30.
  public static func explainSpec(scale: TimeScale) -> (bucketSeconds: Int, targetBars: Int) {
    switch scale {
    case .d30: (3600, 7 * 24)
    case .y2: (86_400, 90)
    default: (86_400, 30)
    }
  }

  public static func compute(bars: [OHLCVBar], scale: TimeScale) -> IndicatorBundle? {
    guard bars.count >= 2 else { return nil }
    let spec = explainSpec(scale: scale)
    let bucketed = ChartSeries.bucketizeOHLCV(bars, bucketSeconds: spec.bucketSeconds)
    let explain = Array(bucketed.suffix(min(spec.targetBars, explainMaxBars)))
    return IndicatorBundle(
      bars: bars,
      marketVision: MarketVision.compute(bars),
      bollinger: BollingerBands.calculate(bars),
      bbwp: BBWP.calculate(bars),
      rsiDivergences: RsiDivergences.calculate(bars),
      explainBars: explain,
      explainMarketVision: MarketVision.compute(explain),
      explainBollinger: BollingerBands.calculate(explain),
      explainBBWP: BBWP.calculate(explain),
      explainRsiDivergences: RsiDivergences.calculate(explain))
  }
}

public extension Array where Element == TimePoint {
  /// `lastFiniteValue`
  var lastFinite: Double? { last(where: { $0.value.isFinite })?.value }
  /// JSON-friendly history (`NaN` → nil).
  var nullableValues: [Double?] { map { $0.value.isFinite ? $0.value : nil } }
}

public extension Array where Element == ColoredPoint {
  var lastFinite: Double? { last(where: { $0.value.isFinite })?.value }
  var nullableValues: [Double?] { map { $0.value.isFinite ? $0.value : nil } }
  var maxAbsFinite: Double { reduce(1.0) { $1.value.isFinite ? Swift.max($0, abs($1.value)) : $0 } }
}
