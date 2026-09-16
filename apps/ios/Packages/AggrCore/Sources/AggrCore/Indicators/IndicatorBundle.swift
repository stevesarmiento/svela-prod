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

/// Lightweight Charts' scale margins expressed as a numeric domain. Only the
/// visible candles determine auto-scale; older extremes must not flatten it.
public enum IndicatorPlotScale {
  public static func domain(points: [TimePoint], visible: ClosedRange<Int>, anchors: [Double] = [], margin: Double = 0.1) -> ClosedRange<Double> {
    let values = points.filter { visible.contains($0.epochSeconds) && $0.value.isFinite }.map(\.value) + anchors.filter(\.isFinite)
    guard let low = values.min(), let high = values.max() else { return 0...100 }
    let span = max(high - low, max(1, abs(high) * 0.02))
    let padding = span * min(0.45, max(0, margin)) / (1 - 2 * min(0.45, max(0, margin)))
    if low == high { return (low - span / 2 - padding)...(high + span / 2 + padding) }
    return (low - padding)...(high + padding)
  }

  /// The web's five-stop BBWP palette uses rounded values and shortest-hue OKLCH interpolation.
  public static func volatilityColor(_ value: Double) -> String {
    let stops = ["oklch(0.452 0.3132 264.05)", "oklch(0.9054 0.1546 194.77)", "oklch(0.8664 0.2948 142.5)", "oklch(0.968 0.211 109.77)", "oklch(0.628 0.2577 29.23)"]
    let v = min(100, max(0, value.isFinite ? value.rounded() : 0))
    let segment = min(3, Int(v / 25))
    return OklchColor.mix(stops[segment], stops[segment + 1], (v - Double(segment * 25)) / 25)
  }
}
