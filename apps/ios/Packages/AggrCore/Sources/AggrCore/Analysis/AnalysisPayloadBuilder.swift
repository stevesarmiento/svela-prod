import Foundation

/// Port of `prepareAnalysisData` + `buildSyntheticOhlcv` in `hooks/use-analysis-data.ts`, and
/// `computeDailyBbwpPct` in `lib/comparative-indicators.ts`. Output feeds `/api/analyze` (`IndicatorDataSchema`).
public enum AnalysisPayload {
  /// Line chart → synthetic OHLCV (`volatility = |Δ|·0.3 + price·0.001`, spread = volatility/2).
  public static func syntheticOHLCV(chart: [TimePoint], volume: [TimePoint]) -> [OHLCVBar] {
    chart.enumerated().map { i, p in
      let price = p.value
      let vol = i < volume.count ? volume[i].value : 0
      let prev = i > 0 ? chart[i - 1].value : price
      let volatility = abs(price - prev) * 0.3 + price * 0.001
      let spread = volatility * 0.5
      return OHLCVBar(time: p.epochSeconds, open: prev, high: max(prev, price) + spread, low: min(prev, price) - spread, close: price, volume: vol)
    }
  }

  /// BBWP percentile on daily closes (synthetic OHLCV) — comparative sidebar / prompt input.
  public static func dailyBbwpPct(series: [TimePoint]) -> Double? {
    let daily = ComparativeStats.toDailyCloses(series)
    guard daily.closes.count >= 30 else { return nil }
    let pts = zip(daily.days, daily.closes).map { TimePoint(epochSeconds: $0 * 86_400, value: $1) }
    let bars = syntheticOHLCV(chart: pts, volume: [])
    return BBWP.calculate(bars).latest
  }

  public struct MarketInput: Sendable {
    public var name: String, symbol: String
    public var price: Double, change24h: Double, marketCap: Double, volume24h: Double
    public init(name: String, symbol: String, price: Double, change24h: Double, marketCap: Double, volume24h: Double) {
      self.name = name; self.symbol = symbol; self.price = price; self.change24h = change24h; self.marketCap = marketCap; self.volume24h = volume24h
    }
  }
  public struct DerivativesInput: Sendable {
    public var openInterest: Double?, openInterestPrev: Double?
    public var longLiquidations: Double?, shortLiquidations: Double?
    public var takerBuyRatioPct: Double?, takerSellRatioPct: Double?, takerBuyVolumeUsd: Double?, takerSellVolumeUsd: Double?
    public init(openInterest: Double? = nil, openInterestPrev: Double? = nil, longLiquidations: Double? = nil, shortLiquidations: Double? = nil,
                takerBuyRatioPct: Double? = nil, takerSellRatioPct: Double? = nil, takerBuyVolumeUsd: Double? = nil, takerSellVolumeUsd: Double? = nil) {
      self.openInterest = openInterest; self.openInterestPrev = openInterestPrev; self.longLiquidations = longLiquidations; self.shortLiquidations = shortLiquidations
      self.takerBuyRatioPct = takerBuyRatioPct; self.takerSellRatioPct = takerSellRatioPct; self.takerBuyVolumeUsd = takerBuyVolumeUsd; self.takerSellVolumeUsd = takerSellVolumeUsd
    }
  }

  /// Everything the LLM payload derives. Matches the field semantics in `prepareAnalysisData`.
  public struct Derived: Sendable {
    public var ohlcv: [OHLCVBar]
    public var bollinger: BollingerBands.Result
    public var marketVision: MarketVisionResult
    public var reverseLevels: [TechnicalIndicators.ReverseRsiLevel]
    public var priceHistory: [Double], volumeHistory: [Double], rsiHistory: [Double]
    public var rsiTrend: String
    public var momentum: String?
    public var volumeTrend: String?
    public var recentVolume: Double?, previousVolume: Double?
    public var support: Double?, resistance: Double?
    public var divergence: String
    public var wt1: Double, wt2: Double, moneyFlow: Double
    public var hasWaveTrend: Bool, hasMoneyFlow: Bool
    public var waveTrendSignal: String, waveTrendMomentum: String
    public var moneyFlowDirection: String, moneyFlowStrength: String
  }

  static func avg(_ v: ArraySlice<Double>) -> Double? { v.isEmpty ? nil : v.reduce(0, +) / Double(v.count) }

  public static func derive(chart: [TimePoint], volume: [TimePoint], market: MarketInput) -> Derived {
    let ohlcv = syntheticOHLCV(chart: chart, volume: volume)
    let bb = BollingerBands.calculate(ohlcv, config: .default)
    let mv = MarketVision.compute(ohlcv)
    let reverse = TechnicalIndicators.reverseRsiLevels(ohlcv.map(\.close), period: 14)
    let bbHistory = bb.indicator.suffix(30).map(\.value).filter { $0 >= 0 && $0 <= 100 }
    let priceHistory = chart.suffix(30).map(\.value)
    let volumeHistory = volume.suffix(30).map(\.value)
    let rsiTrend: String = bbHistory.count >= 14
      ? ((avg(bbHistory.suffix(7)) ?? 0) > (avg(bbHistory.dropLast(7).suffix(7)) ?? 0) ? "improving" : "deteriorating")
      : "neutral"
    let recentAvg = avg(priceHistory.suffix(7)), previousAvg = avg(priceHistory.dropLast(7).suffix(7))
    let momentum: String? = (recentAvg != nil && previousAvg != nil) ? (recentAvg! > previousAvg! ? "bullish" : "bearish") : nil
    let recentVol = avg(volumeHistory.suffix(7)), prevVol = avg(volumeHistory.dropLast(7).suffix(7))
    let volumeTrend: String? = (recentVol != nil && prevVol != nil) ? (recentVol! > prevVol! * 1.2 ? "increasing" : (recentVol! < prevVol! * 0.8 ? "decreasing" : "stable")) : nil
    let recent21 = priceHistory.suffix(21)
    let support = recent21.min(), resistance = recent21.max()
    let curRsiAvg = bbHistory.count >= 7 ? (avg(bbHistory.suffix(7)) ?? 50) : 50
    let prevRsiAvg = bbHistory.count >= 14 ? (avg(bbHistory.dropLast(7).suffix(7)) ?? 50) : 50
    let priceDir: String? = previousAvg.map { market.price > $0 ? "up" : "down" }
    let rsiDir = curRsiAvg > prevRsiAvg ? "up" : "down"
    let divergence = (priceDir != nil && priceDir != rsiDir) ? (priceDir == "up" ? "bearish" : "bullish") : "none"
    // `?.value || 0` in TS also maps NaN → 0.
    func fin(_ p: ColoredPoint?) -> Double { (p?.value.isFinite ?? false) ? p!.value : 0 }
    let wt1 = fin(mv.series.wt1.last), wt2 = fin(mv.series.wt2.last)
    let mf = fin(mv.series.rsiMfi.last)
    let hasWT = mv.series.wt1.count >= 2
    let pw1 = mv.series.wt1.dropLast().last?.value, pw2 = mv.series.wt2.dropLast().last?.value
    let wtSignal: String = {
      if let a = pw1, let b = pw2, a <= b, wt1 > wt2 { return "bullish_cross" }
      if let a = pw1, let b = pw2, a >= b, wt1 < wt2 { return "bearish_cross" }
      if wt1 >= 53 { return "overbought" }
      if wt1 <= -53 { return "oversold" }
      return "neutral"
    }()
    let spread = abs(wt1 - wt2)
    let wtMomentum = spread >= 10 ? "strong" : (spread >= 5 ? "moderate" : "weak")
    let mfDir = mf > 0 ? "inflow" : (mf < 0 ? "outflow" : "neutral")
    let mfStrength = abs(mf) >= 10 ? "strong" : (abs(mf) >= 5 ? "moderate" : "weak")
    return Derived(ohlcv: ohlcv, bollinger: bb, marketVision: mv, reverseLevels: reverse, priceHistory: priceHistory, volumeHistory: volumeHistory, rsiHistory: bbHistory,
                   rsiTrend: rsiTrend, momentum: momentum, volumeTrend: volumeTrend, recentVolume: recentVol, previousVolume: prevVol, support: support, resistance: resistance,
                   divergence: divergence, wt1: wt1, wt2: wt2, moneyFlow: mf, hasWaveTrend: hasWT, hasMoneyFlow: !mv.series.rsiMfi.isEmpty,
                   waveTrendSignal: wtSignal, waveTrendMomentum: wtMomentum, moneyFlowDirection: mfDir, moneyFlowStrength: mfStrength)
  }
}
