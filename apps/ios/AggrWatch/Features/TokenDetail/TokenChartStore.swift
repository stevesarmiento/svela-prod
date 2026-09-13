import AggrAPI
import AggrCore
import Foundation
import Observation

/// Port of `use-coingecko-chart-data.ts` (token scales always prefer `/market-chart`), plus derived overlays:
/// Hull Suite (Ehma 55), price projection, daily OHLCV for metrics.
@Observable
final class TokenChartStore {
  let coinId: String
  private(set) var scale: TimeScale = .d30
  private(set) var data: ParsedChartData = .empty
  private(set) var dataScale: TimeScale = .d30
  private(set) var hasObservedHistory = false
  private(set) var isLoading = true
  private(set) var isWarmingUp = false
  private(set) var isStale = false
  private(set) var error: String?
  private(set) var quote: CoinQuote?
  private(set) var quoteError: String?

  private(set) var hull: HullSuite.Result = .init(mhull: [], shull: [], trendingUp: [], trendingDown: [])
  private(set) var projection: PriceProjection.Result?
  /// Phase 6: MarketVision / Bollinger / BBWP / RSI divergences (+ explain series), computed off-main.
  private(set) var indicators: IndicatorBundle?
  private var indicatorHistory: ParsedChartData?
  private var indicatorGeneration = 0

  private let market: MarketAPI
  private let cache: QueryCache
  private var pollTask: Task<Void, Never>?
  private var fastPollCount = 0

  init(coinId: String, market: MarketAPI, cache: QueryCache, initialQuote: CoinQuote?) {
    self.coinId = coinId
    self.market = market
    self.cache = cache
    self.quote = initialQuote
  }

  // MARK: Derived

  var alignedPrice: Double? { ChartSeries.alignedPrice(data.line) }
  var priceWindow: TokenPriceWindow { TokenPriceWindow(history: hasObservedHistory ? data.line : [], scale: dataScale) }

  /// OHLC bars with volume merged by epoch (token-page `indicatorData`).
  var indicatorBars: [OHLCVBar] {
    let history = indicatorHistory ?? data
    let volByEpoch = Dictionary(history.volume.map { ($0.epochSeconds, $0.value) }, uniquingKeysWith: { _, b in b })
    return history.ohlc.map { b in var c = b; c.volume = volByEpoch[b.time] ?? 0; return c }
  }

  var dailyOhlcv: [OHLCVBar] { ChartSeries.bucketizeOHLCV(indicatorBars, bucketSeconds: 86_400) }

  /// `indicatorWindowDays`
  var indicatorWindowDays: Int { scale == .y2 ? 60 : (scale == .max ? 30 : 14) }

  // MARK: Lifecycle

  func start(scale: TimeScale) {
    self.scale = scale
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      guard let self else { return }
      await refreshQuote()
      while !Task.isCancelled {
        await load(force: false)
        let points = data.line.count
        let interval: Duration
        if (points < 2 || isWarmingUp) && fastPollCount < 24 {
          fastPollCount += 1
          interval = .seconds(5)
        } else {
          fastPollCount = 0
          interval = QueryPolicy.chart.refetchInterval ?? .seconds(120)
        }
        try? await Task.sleep(for: interval)
        if Task.isCancelled { break }
        await refreshQuote()
      }
    }
  }

  func setScale(_ next: TimeScale) {
    guard next != scale else { return }
    isLoading = true
    start(scale: next)
  }

  func stop() { pollTask?.cancel(); pollTask = nil; indicatorGeneration += 1 }

  func refreshQuote() async {
    do {
      let ids = [coinId]
      let key = QueryCache.Key("coingecko-quote", coinId)
      let response = try await cache.fetch(key, policy: .quotes) { [market] in try await market.quotes(ids: ids, sparkline: true) }
      try Task.checkCancellation()
      if let q = response.data[coinId] { quote = q }
      quoteError = nil
    } catch is CancellationError {
    } catch {
      quoteError = error.localizedDescription
    }
  }

  func load(force: Bool) async {
    let scale = self.scale
    let key = QueryCache.Key("token-chart", coinId, scale.rawValue)
    do {
      let response = try await cache.fetch(key, policy: .chart, force: force) { [market, coinId] in
        try await market.marketChart(coinId: coinId, days: scale.tokenChartDaysParam, vsCurrency: "usd")
      }
      guard !Task.isCancelled, scale == self.scale else { return }
      let prices = response.data.prices.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let volumes = response.data.volumes.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let mcaps = response.data.market_caps.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let observed = ChartSeries.parseMarketChart(prices: prices, volumes: volumes, marketCaps: mcaps, scale: scale)
      var parsed = observed ?? fallbackData()
      hasObservedHistory = observed != nil
      dataScale = scale
      if let p = quote?.currentPrice, p > 0 {
        let t = Int((quote?.lastUpdatedDate ?? Date()).timeIntervalSince1970)
        if t >= (parsed.line.last?.epochSeconds ?? Int.min) {
          parsed = ChartSeries.upsertLatestPrice(parsed, latestPrice: p, atEpochSeconds: t)
        }
      }
      data = parsed
      hull = HullSuite.compute(parsed.ohlc, config: .tokenPage)
      isStale = response.status?.stale ?? false
      let points = response.status?.points.map { Int($0) } ?? parsed.line.count
      isWarmingUp = (response.status?.warmupRequested ?? false) || points < 2 || !hasObservedHistory
      error = nil
      isLoading = false
      // Short mobile ranges still need warmup history for indicators and daily metrics.
      // Reuse the cached 90-day request used by the 1M view; this does not expand the price window.
      if scale == .d1 || scale == .d7 {
        let history = try? await cache.fetch(QueryCache.Key("token-chart", coinId, TimeScale.d30.rawValue), policy: .chart, force: force) { [market, coinId] in
          try await market.marketChart(coinId: coinId, days: TimeScale.d30.tokenChartDaysParam, vsCurrency: "usd")
        }
        guard !Task.isCancelled, scale == self.scale else { return }
        if let history {
          indicatorHistory = ChartSeries.parseMarketChart(
            prices: history.data.prices.map { .init(time: $0.time, value: $0.value) },
            volumes: history.data.volumes.map { .init(time: $0.time, value: $0.value) },
            marketCaps: [], scale: .d30)
        }
      } else { indicatorHistory = nil }
      recomputeOverlays()
    } catch is CancellationError {
      return
    } catch {
      guard !Task.isCancelled, scale == self.scale else { return }
      self.error = error.localizedDescription
      if data.line.isEmpty { data = fallbackData(); recomputeOverlays() }
    }
    isLoading = false
  }

  /// `generateFallbackData`: flat daily line anchored at the quote price (no fake movement); empty without a price.
  private func fallbackData() -> ParsedChartData {
    guard let p = quote?.currentPrice, p > 0 else { return .empty }
    let days = Int(scale.tokenChartDaysParam) ?? 365
    let n = max(2, min(days, 90))
    let now = Int(Date().timeIntervalSince1970)
    let bars = (0..<n).map { i in OHLCVBar(time: now - (n - i) * 86_400, open: p, high: p, low: p, close: p) }
    return ParsedChartData(line: bars.map { TimePoint(epochSeconds: $0.time, value: $0.close) },
                           volume: bars.map { TimePoint(epochSeconds: $0.time, value: 0) }, ohlc: bars, marketCap: [])
  }

  private func recomputeOverlays() {
    let bars = indicatorBars
    hull = HullSuite.compute(data.ohlc, config: .tokenPage)
    let inputs = data.ohlc.map { PriceProjection.InputPoint(timeEpochSec: $0.time, close: $0.close) }
    let warming = isWarmingUp
    // Hull-only cone immediately; BBWP vol regime + RSI divergence tilt land once the bundle is ready.
    let hullOnly = PriceProjection.Modifiers(smootherSlopePerBar: PriceProjection.smootherSlopePerBar(hull.mhull))
    projection = warming ? nil : PriceProjection.compute(inputs, modifiers: hullOnly)
    indicatorGeneration += 1
    let generation = indicatorGeneration
    let scale = self.scale
    let smoother = hull.mhull
    Task.detached(priority: .userInitiated) { [weak self] in
      let bundle = IndicatorBundle.compute(bars: bars, scale: scale)
      var modifiers = hullOnly
      if let bundle {
        modifiers = PriceProjection.Modifiers(
          smootherSlopePerBar: PriceProjection.smootherSlopePerBar(smoother),
          volRegimePercentile: bundle.bbwp.bbwp.lastFinite,
          sentimentTilt: ProjectionInputs.sentimentTilt(divergences: bundle.rsiDivergences.divergences, barCount: bars.count))
      }
      let projection = warming ? nil : PriceProjection.compute(inputs, modifiers: modifiers)
      await MainActor.run { [weak self] in
        guard let self, self.indicatorGeneration == generation else { return }
        self.indicators = bundle
        self.projection = projection
      }
    }
  }
}

#if DEBUG
extension TokenChartStore {
  func seedPreview() {
    data = PreviewFixtures.chart
    hasObservedHistory = true
    isLoading = false
    indicators = PreviewFixtures.indicators
    hull = HullSuite.compute(PreviewFixtures.bars, config: .tokenPage)
    projection = PriceProjection.compute(PreviewFixtures.bars.map { .init(timeEpochSec: $0.time, close: $0.close) })
  }
}
#endif

/// A visible price window is independent of the longer history used to warm indicators.
struct TokenPriceWindow {
  let points: [TimePoint]
  let isPartial: Bool

  init(history: [TimePoint], scale: TimeScale) {
    let valid = history.filter { $0.value.isFinite && $0.value > 0 }.sorted { $0.epochSeconds < $1.epochSeconds }
    guard let last = valid.last, let first = valid.first else { points = []; isPartial = true; return }
    let start = last.epochSeconds - scale.rangeDays * 86_400
    // A feed's first bucket can sit just after the requested boundary. Treat a
    // normal sampling gap as a full range, but label materially shorter histories.
    let cadence = valid.count > 1 ? valid[1].epochSeconds - first.epochSeconds : 0
    let tolerance = min(Double(scale.rangeDays * 86_400) * 0.05, Double(max(60, cadence)))
    isPartial = Double(first.epochSeconds - start) > tolerance
    var visible = valid.filter { $0.epochSeconds >= start }
    // Interpolate only between observed samples, never extend missing history backward.
    if let before = valid.last(where: { $0.epochSeconds < start }), let after = visible.first, after.epochSeconds > start {
      let fraction = Double(start - before.epochSeconds) / Double(after.epochSeconds - before.epochSeconds)
      visible.insert(.init(epochSeconds: start, value: before.value + (after.value - before.value) * fraction), at: 0)
    }
    points = visible
  }

  func dollarChange(to value: Double?) -> Double? {
    guard points.count >= 2, let base = points.first?.value, base > 0,
          let value, value.isFinite, value > 0 else { return nil }
    return value - base
  }

  func percentChange(to value: Double?) -> Double? {
    guard points.count >= 2, let base = points.first?.value, base > 0,
          let value, value.isFinite, value > 0 else { return nil }
    return (value / base - 1) * 100
  }

  func periodLabel(scale: TimeScale) -> String {
    if isPartial { return "Available history" }
    switch scale {
    case .d1: return "Past day"
    case .d7: return "Past week"
    case .d30: return "Past month"
    case .max: return "Past year"
    case .y2: return "Past 2 years"
    }
  }
}
