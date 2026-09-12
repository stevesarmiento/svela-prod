import Foundation

/// `hooks/use-price-projection.ts` modifier inputs derived from the indicator bars.
public enum ProjectionInputs {
  /// Latest finite BBWP percentile (0-100).
  public static func volRegimePercentile(_ bars: [OHLCVBar]) -> Double? {
    BBWP.calculate(bars).bbwp.last(where: { $0.value.isFinite })?.value
  }

  /// +1 / -1 from the most recent RSI divergence inside the recency window; nil when none.
  public static func sentimentTilt(_ bars: [OHLCVBar]) -> Double? {
    sentimentTilt(divergences: RsiDivergences.calculate(bars).divergences, barCount: bars.count)
  }

  public static func sentimentTilt(divergences divs: [RsiDivergences.Divergence], barCount: Int) -> Double? {
    guard !divs.isEmpty else { return nil }
    let cutoff = barCount - max(8, Int((Double(barCount) * PriceProjection.divergenceRecencyRatio).rounded()))
    guard let latest = divs.filter({ $0.endIndex >= cutoff }).max(by: { $0.endIndex < $1.endIndex }) else { return nil }
    return latest.type.isBullish ? 1 : -1
  }

  public static func modifiers(bars: [OHLCVBar], smootherLine: [TimePoint]) -> PriceProjection.Modifiers {
    PriceProjection.Modifiers(smootherSlopePerBar: PriceProjection.smootherSlopePerBar(smootherLine),
                              volRegimePercentile: volRegimePercentile(bars), sentimentTilt: sentimentTilt(bars))
  }
}
