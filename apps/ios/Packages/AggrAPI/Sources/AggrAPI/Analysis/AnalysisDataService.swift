import AggrCore
import Foundation

/// Port of `useAnalysisData().prepareAnalysisData` — assembles the `/api/analyze` payload for one coin:
/// CoinGecko markets row + 30d market chart (90d/4h buckets) + CoinGlass OI / liquidations / taker flow.
public struct AnalysisDataService: Sendable {
  public struct Bundle: Sendable {
    public var data: IndicatorData
    /// 30d line series (for `ComparativeStats` returns/correlations).
    public var series: [TimePoint]
    public var bbwpPct: Double?
    public var comparativeInput: ComparativeStats.Input {
      let wt = data.marketVision?.waveTrend, mf = data.marketVision?.moneyFlow
      return .init(id: data.symbolId, symbol: data.symbol, name: data.name, marketCap: data.quote.USD.market_cap,
                   series: series, priceHistory: data.priceContext?.priceHistory ?? [],
                   rsi: data.marketVision?.rsi?.value, bbPercentB: data.bollingerBands.flatMap { bb in
                     bb.upperBand > bb.lowerBand ? (bb.currentValue - bb.lowerBand) / (bb.upperBand - bb.lowerBand) : nil },
                   bbwpPct: bbwpPct,
                   waveTrend: wt.map { "\($0.signal)\($0.momentum.map { " (\($0))" } ?? "")" },
                   moneyFlow: mf.map { "\($0.direction) (\($0.strength))" },
                   openInterestChangePct: data.liquidationData?.openInterestChange, takerBuyRatio: data.orderFlow?.takerBuyRatio)
    }
  }

  public enum Failure: Error, LocalizedError {
    case noMarketData
    public var errorDescription: String? { "Unable to prepare analysis data. Please try again." }
  }

  let market: MarketAPI
  let derivatives: DerivativesAPI
  let cache: QueryCache

  public init(market: MarketAPI, derivatives: DerivativesAPI, cache: QueryCache) {
    self.market = market; self.derivatives = derivatives; self.cache = cache
  }

  public func build(coinId: String, fallbackName: String? = nil, fallbackSymbol: String? = nil) async throws -> Bundle {
    let scale = TimeScale.d30
    async let marketsTask = cache.fetch(QueryCache.Key("coingecko-markets", coinId), policy: .defaults) { [market] in try await market.markets(ids: [coinId]) }
    async let chartTask = cache.fetch(QueryCache.Key("token-chart", coinId, scale.rawValue), policy: .chart) { [market] in
      try await market.marketChart(coinId: coinId, days: scale.tokenChartDaysParam, vsCurrency: "usd")
    }
    async let oiTask: OpenInterestResponse? = try? cache.fetch(QueryCache.Key("open-interest", coinId), policy: .openInterest) { [derivatives] in try await derivatives.openInterest(symbol: coinId) }
    async let liqTask: LiquidationHistoryResponse? = try? cache.fetch(QueryCache.Key("liquidations", coinId), policy: .liquidations) { [derivatives] in try await derivatives.liquidationHistory(symbol: coinId) }
    async let takerTask: TakerBuySellResponse? = try? cache.fetch(QueryCache.Key("taker-buy-sell", coinId), policy: .takerFlow) { [derivatives] in try await derivatives.takerBuySell(symbol: coinId) }

    let markets = try await marketsTask
    guard let row = markets.data.first else { throw Failure.noMarketData }
    let chartResponse = try await chartTask
    let prices = chartResponse.data.prices.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
    let volumes = chartResponse.data.volumes.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
    let mcaps = chartResponse.data.market_caps.map { ChartSeries.RawPoint(time: $0.time, value: $0.value) }
    let parsed = ChartSeries.parseMarketChart(prices: prices, volumes: volumes, marketCaps: mcaps, scale: scale)
    let line = parsed?.line ?? []
    let volume = parsed?.volume ?? []
    let (oi, liq, taker) = await (oiTask, liqTask, takerTask)

    let price = row.current_price ?? 0
    let pct = row.price_change_percentage_24h ?? 0
    let mkt = AnalysisPayload.MarketInput(name: row.name, symbol: row.symbol, price: price, change24h: pct, marketCap: row.market_cap ?? 0, volume24h: row.total_volume ?? 0)
    let d = AnalysisPayload.derive(chart: line, volume: volume, market: mkt)

    let volatility = abs(pct) > 5 ? "high" : (abs(pct) > 2 ? "moderate" : "low")
    let bbLatest = d.bollinger.indicator.last.flatMap { $0.value.isFinite ? $0.value : nil }
    func fin(_ p: TimePoint?) -> Double? { p.flatMap { $0.value.isFinite ? $0.value : nil } }

    var data = IndicatorData(
      name: row.name.isEmpty ? (fallbackName ?? "Unknown Token") : row.name,
      symbol: row.symbol.isEmpty ? (fallbackSymbol ?? "UNK") : row.symbol,
      quote: .init(USD: .init(price: price, percent_change_24h: pct, market_cap: row.market_cap ?? 0, volume_24h: row.total_volume ?? 0, volume_change_24h: 0, market_cap_dominance: 0)),
      timeframe: scale.rawValue)
    data.symbolId = coinId

    if d.priceHistory.count >= 14, let momentum = d.momentum, let support = d.support, let resistance = d.resistance {
      data.priceContext = .init(currentPrice: price, priceHistory: d.priceHistory, momentum: momentum, volatility: volatility, support: support, resistance: resistance)
    }
    if d.volumeHistory.count >= 14, let vt = d.volumeTrend, let rv = d.recentVolume, let pv = d.previousVolume {
      let avg = d.volumeHistory.reduce(0, +) / Double(d.volumeHistory.count)
      data.volumeAnalysis = .init(currentVolume: row.total_volume ?? 0, volumeHistory: d.volumeHistory, volumeTrend: vt, averageVolume: avg, volumeSpike: rv > pv * 1.5)
    }
    if let momentum = d.momentum {
      data.hullSuite = .init(trendDirection: momentum, mhull: nil, shull: nil, crossoverSignal: "none", strength: abs(pct) > 3 ? "strong" : "moderate")
    }
    if let cur = bbLatest {
      let upper = fin(d.bollinger.upper.last), lower = fin(d.bollinger.lower.last), basis = fin(d.bollinger.basis.last)
      data.bollingerBands = .init(indicator: "RSI", currentValue: cur, upperBand: upper ?? 0, lowerBand: lower ?? 0, basis: basis ?? 0,
                                  position: cur > (upper ?? 70) ? "overbought" : (cur < (lower ?? 30) ? "oversold" : "normal"),
                                  breachType: "none", divergence: d.divergence, trend: d.rsiTrend, history: d.rsiHistory)
      data.marketVision = .init(
        rsi: .init(value: cur, signal: cur > 70 ? "overbought" : (cur < 30 ? "oversold" : "neutral"), trend: d.rsiTrend, history: d.rsiHistory, divergence: d.divergence,
                   reverseLevels: d.reverseLevels.map { .init(target: $0.target, price: $0.price) }, reverseBasis: "close_rsi14"),
        waveTrend: d.hasWaveTrend ? .init(wt1: d.wt1, wt2: d.wt2, signal: d.waveTrendSignal, momentum: d.waveTrendMomentum) : nil,
        moneyFlow: d.hasMoneyFlow ? .init(direction: d.moneyFlowDirection, strength: d.moneyFlowStrength, value: d.moneyFlow) : nil)
    }
    let latestOI = oi?.data.last?.close
    let oiChange = oi?.changePct
    let lastLiq = liq?.data.last
    if latestOI != nil || oiChange != nil || lastLiq != nil {
      data.liquidationData = .init(totalLiquidations24h: lastLiq.map { $0.longLiquidations + $0.shortLiquidations }, longLiquidations: lastLiq?.longLiquidations,
                                   shortLiquidations: lastLiq?.shortLiquidations, openInterest: latestOI, openInterestChange: oiChange)
    }
    if let overall = taker?.meaningfulOverall {
      let buy = overall.buyRatio, sell = overall.sellRatio
      data.orderFlow = .init(takerBuyRatio: buy / 100, buyVolumeUsd: overall.buyVolumeUsd, sellVolumeUsd: overall.sellVolumeUsd,
                             buyPressure: buy > 52 ? "high" : (buy > 48 ? "moderate" : "low"), sellPressure: sell > 52 ? "high" : (sell > 48 ? "moderate" : "low"),
                             netFlow: buy > sell ? "bullish" : "bearish")
    }
    if let vt = d.volumeTrend, let momentum = d.momentum {
      data.priceAction = .init(trend: pct > 2 ? "uptrend" : (pct < -2 ? "downtrend" : "sideways"), volatility: volatility, volume_profile: vt,
                               priceLevel: "neutral", momentum: momentum, divergenceSignal: d.divergence != "none")
    }
    return Bundle(data: data, series: line, bbwpPct: AnalysisPayload.dailyBbwpPct(series: line))
  }
}
