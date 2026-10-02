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
  /// Chart-ready conversion of `indicators`, published in the same update.
  private(set) var indicatorCharts: IndicatorChartData?
  private(set) var isComputingIndicators = false
  private var indicatorHistory: ParsedChartData?
  private var indicatorGeneration = 0
  private var indicatorTask: Task<Void, Never>?
  /// True from the start of an overlay pass until its final publish; a cancelled pass leaves
  /// hull/projection/dailyOhlcv/indicators describing older data than `data`.
  @ObservationIgnored private var derivedStale = false

  // MARK: Derived (stored; rewritten only when their inputs change)

  /// Last finite, positive close of the visible history.
  private(set) var alignedPrice: Double?
  /// The header's visible window; readouts hit this on every tick and scrub step.
  private(set) var priceWindow = TokenPriceWindow(history: [], scale: .d30)
  /// Daily candles for market metrics, bucketed from the indicator history off-main.
  private(set) var dailyOhlcv: [OHLCVBar] = []

  private let market: MarketAPI
  private let cache: QueryCache
  private var pollTask: Task<Void, Never>?
  private var fastPollCount = 0
  /// Bumped by every `start`, so a load that outlives a restart cannot write stale data.
  private var loadGeneration = 0

  init(coinId: String, market: MarketAPI, cache: QueryCache, initialQuote: CoinQuote?) {
    self.coinId = coinId
    self.market = market
    self.cache = cache
    self.quote = initialQuote
  }

  /// Short price windows use the same 90-day indicator history as the web 1M view.
  var indicatorScale: TimeScale { scale == .d1 || scale == .d7 ? .d30 : scale }
  var isIndicatorPending: Bool { isLoading || isComputingIndicators }

  /// `indicatorWindowDays`
  var indicatorWindowDays: Int { scale == .y2 ? 60 : (scale == .max ? 30 : 14) }

  // MARK: Lifecycle

  func start(scale: TimeScale) {
    indicatorGeneration += 1
    loadGeneration += 1
    indicatorTask?.cancel()
    indicatorTask = nil
    self.scale = scale
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      guard let self else { return }
      // Cache-first: a bulk watchlist fetch seeds this coin's quote entry.
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

  func stop() {
    pollTask?.cancel(); pollTask = nil
    indicatorTask?.cancel(); indicatorTask = nil
    indicatorGeneration += 1
    // The cancelled pass may never publish; the next successful load must recompute.
    if isComputingIndicators { isComputingIndicators = false }
  }

  func refreshQuote() async {
    do {
      let ids = [coinId]
      let key = QueryCache.Key("coingecko-quote", coinId)
      let response = try await cache.fetch(key, policy: .quotes, force: false) { [market] in try await market.quotes(ids: ids, sparkline: true) }
      try Task.checkCancellation()
      if let q = response.data[coinId], q != quote { quote = q }
      if quoteError != nil { quoteError = nil }
    } catch is CancellationError {
    } catch {
      if quoteError != error.localizedDescription { quoteError = error.localizedDescription }
    }
  }

  /// Shared with watchlists / compare / overview: keyed by the `days` string actually requested.
  private func fetchChart(days: String, force: Bool) async throws -> MarketChartResponse {
    try await cache.fetch(QueryCache.Key("market-chart", coinId, days), policy: .chart, force: force) { [market, coinId] in
      try await market.marketChart(coinId: coinId, days: days)
    }
  }

  /// Short mobile ranges still need warmup history for indicators and daily metrics. Reuse the
  /// cached 90-day request used by the 1M view; this does not expand the price window.
  private func fetchWarmupHistory(force: Bool, enabled: Bool) async -> MarketChartResponse? {
    guard enabled else { return nil }
    return try? await fetchChart(days: TimeScale.d30.tokenChartDaysParam, force: force)
  }

  /// Loads the current scale. Polls refresh silently: nothing is written unless it changed, so
  /// an unchanged payload costs the chart, header, metrics and indicators no re-render.
  func load(force: Bool) async {
    let scale = self.scale
    let generation = loadGeneration
    do {
      async let primary = fetchChart(days: scale.tokenChartDaysParam, force: force)
      async let warmup = fetchWarmupHistory(force: force, enabled: scale == .d1 || scale == .d7)
      let response = try await primary
      guard !Task.isCancelled, generation == loadGeneration, scale == self.scale else { return }
      let prices = response.data.prices.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let volumes = response.data.volumes.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let mcaps = response.data.market_caps.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
      let observed = ChartSeries.parseMarketChart(prices: prices, volumes: volumes, marketCaps: mcaps, scale: scale)
      var parsed = observed ?? fallbackData()
      let observedNow = observed != nil
      let observedChanged = hasObservedHistory != observedNow
      if observedChanged { hasObservedHistory = observedNow }
      let scaleChanged = dataScale != scale
      if scaleChanged { dataScale = scale }
      if let p = quote?.currentPrice, p > 0 {
        // When the API omits `lastUpdatedDate` the synthetic point moves every poll and the
        // write-on-change below degrades to a rewrite; harmless, just not silent.
        let t = Int((quote?.lastUpdatedDate ?? Date()).timeIntervalSince1970)
        if t >= (parsed.line.last?.epochSeconds ?? Int.min) {
          parsed = ChartSeries.upsertLatestPrice(parsed, latestPrice: p, atEpochSeconds: t)
        }
      }
      let dataChanged = parsed != data
      if dataChanged { data = parsed }
      if dataChanged || scaleChanged || observedChanged { refreshDerived() }
      let stale = response.status?.stale ?? false
      if isStale != stale { isStale = stale }
      let points = response.status?.points.map { Int($0) } ?? parsed.line.count
      let warming = (response.status?.warmupRequested ?? false) || points < 2 || !observedNow
      if isWarmingUp != warming { isWarmingUp = warming }
      if error != nil { error = nil }
      if isLoading { isLoading = false }
      let warmupResponse = await warmup
      guard !Task.isCancelled, generation == loadGeneration, scale == self.scale else { return }
      let history = warmupResponse.flatMap { history in
        ChartSeries.parseMarketChart(
          prices: history.data.prices.map { .init(time: $0.time, value: $0.value) },
          volumes: history.data.volumes.map { .init(time: $0.time, value: $0.value) },
          marketCaps: [], scale: .d30)
      }
      let historyChanged = history != indicatorHistory
      if historyChanged { indicatorHistory = history }
      if dataChanged || historyChanged || scaleChanged || indicators == nil || derivedStale { recomputeOverlays() }
    } catch is CancellationError {
      return
    } catch {
      guard !Task.isCancelled, generation == loadGeneration, scale == self.scale else { return }
      if self.error != error.localizedDescription { self.error = error.localizedDescription }
      if isComputingIndicators { isComputingIndicators = false }
      if data.line.isEmpty { data = fallbackData(); refreshDerived(); recomputeOverlays() }
    }
    if isLoading { isLoading = false }
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

  /// Header/metrics inputs that follow `data` / `dataScale` / `hasObservedHistory`.
  private func refreshDerived() {
    let window = TokenPriceWindow(history: hasObservedHistory ? data.line : [], scale: dataScale)
    if window != priceWindow { priceWindow = window }
    let aligned = ChartSeries.alignedPrice(data.line)
    if aligned != alignedPrice { alignedPrice = aligned }
  }

  /// OHLC bars with volume merged by epoch (token-page `indicatorData`).
  nonisolated private static func indicatorBars(_ history: ParsedChartData) -> [OHLCVBar] {
    let volByEpoch = Dictionary(history.volume.map { ($0.epochSeconds, $0.value) }, uniquingKeysWith: { _, b in b })
    return history.ohlc.map { b in var c = b; c.volume = volByEpoch[b.time] ?? 0; return c }
  }

  /// One cancellable detached pass: Hull + hull-only cone + daily candles land first (the cone
  /// appears immediately), then the indicator bundle and the regime/sentiment-tilted cone.
  private func recomputeOverlays() {
    indicatorTask?.cancel()
    derivedStale = true
    isComputingIndicators = true
    indicatorGeneration += 1
    let generation = indicatorGeneration
    let scale = self.scale
    let indicatorScale = self.indicatorScale
    let data = self.data
    let history = indicatorHistory ?? data
    let warming = isWarmingUp
    indicatorTask = Task.detached(priority: .userInitiated) { [weak self] in
      let bars = Self.indicatorBars(history)
      let daily = ChartSeries.bucketizeOHLCV(bars, bucketSeconds: 86_400)
      let hull = HullSuite.compute(data.ohlc, config: .tokenPage)
      let inputs = data.ohlc.map { PriceProjection.InputPoint(timeEpochSec: $0.time, close: $0.close) }
      let hullOnly = PriceProjection.Modifiers(smootherSlopePerBar: PriceProjection.smootherSlopePerBar(hull.mhull))
      let quickProjection = warming ? nil : PriceProjection.compute(inputs, modifiers: hullOnly)
      guard !Task.isCancelled else { return }
      await MainActor.run { [weak self] in
        guard let self, self.indicatorGeneration == generation, self.scale == scale else { return }
        if self.hull != hull { self.hull = hull }
        if self.projection != quickProjection { self.projection = quickProjection }
        if self.dailyOhlcv != daily { self.dailyOhlcv = daily }
      }
      guard !Task.isCancelled else { return }
      let bundle = IndicatorBundle.compute(bars: bars, scale: indicatorScale)
      let charts = bundle.map(IndicatorChartData.init)
      var modifiers = hullOnly
      if let bundle {
        modifiers = PriceProjection.Modifiers(
          smootherSlopePerBar: PriceProjection.smootherSlopePerBar(hull.mhull),
          volRegimePercentile: bundle.bbwp.bbwp.lastFinite,
          sentimentTilt: ProjectionInputs.sentimentTilt(divergences: bundle.rsiDivergences.divergences, barCount: bars.count))
      }
      let projection = warming ? nil : PriceProjection.compute(inputs, modifiers: modifiers)
      guard !Task.isCancelled else { return }
      await MainActor.run { [weak self] in
        guard let self, self.indicatorGeneration == generation, self.scale == scale else { return }
        if self.indicators != bundle { self.indicators = bundle; self.indicatorCharts = charts }
        self.isComputingIndicators = false
        self.derivedStale = false
        if self.projection != projection { self.projection = projection }
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
    refreshDerived()
    dailyOhlcv = ChartSeries.bucketizeOHLCV(Self.indicatorBars(data), bucketSeconds: 86_400)
    indicators = PreviewFixtures.indicators
    indicatorCharts = IndicatorChartData(PreviewFixtures.indicators)
    hull = HullSuite.compute(PreviewFixtures.bars, config: .tokenPage)
    projection = PriceProjection.compute(PreviewFixtures.bars.map { .init(timeEpochSec: $0.time, close: $0.close) })
  }
}
#endif

/// A visible price window is independent of the longer history used to warm indicators.
struct TokenPriceWindow: Equatable {
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
    isPartial ? "Available history" : scale.periodLabel
  }
}
