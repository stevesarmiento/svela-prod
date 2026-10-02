import AggrAPI
import AggrCore
import SwiftUI

/// Port of `token-indicators-section.tsx`: four indicator cards (Momentum & Money Flow, Bollinger Bands,
/// Volatility, Divergences), each with a stats strip and an Explain sheet.
struct TokenIndicatorsSection: View {
  let store: TokenChartStore
  let coinId: String
  let quote: CoinQuote?

  /// One crosshair shared by the four panes; only their rule/readout overlays observe it.
  @State private var scrub = IndicatorScrubStore()
  @State private var explainScrub = IndicatorScrubStore()
  @State private var explain: ExplainTarget?

  private enum ExplainTarget: String, Identifiable { case marketVision, bollinger, bbwp, rsi; var id: String { rawValue } }

  private func explainSourceID(_ target: ExplainTarget) -> String { "indicator-explain|\(coinId)|\(target.rawValue)" }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Technical Indicators").font(.title2.weight(.semibold))
      if let b = store.indicators, let charts = store.indicatorCharts {
        momentumCard(b, charts)
        bollingerCard(b, charts)
        volatilityCard(b, charts)
        divergencesCard(b, charts)
      } else {
        ForEach(0..<4, id: \.self) { _ in loadingCard }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: explain) { _, _ in explainScrub.set(nil) }
    // The explanation is a page over the token page: it zooms out of the card's Explain button
    // and collapses back into it on pull or close.
    .fullScreenPage(item: $explain, sourceID: { explainSourceID($0) }) { target, close in
      if let b = store.indicators, let charts = store.indicatorCharts { explainPage(target, b, charts, close: close) }
    }
  }

  private var loadingCard: some View {
    VStack(alignment: .leading, spacing: 8) {
      SkeletonBlock(height: 14, width: 160)
      SkeletonBlock(height: 200)
    }
    .padding(.vertical, 12)
  }

  // MARK: Cards

  private func momentumCard(_ b: IndicatorBundle, _ charts: IndicatorChartData) -> some View {
    IndicatorCardFrame(title: "Momentum & Money Flow", description: "Tracks momentum shifts using WaveTrend + money flow.",
                       isPending: store.isIndicatorPending, explainSourceID: explainSourceID(.marketVision), onExplain: { explain = .marketVision }) {
      MarketVisionChart(data: charts.marketVision, windowDays: store.indicatorWindowDays, scrub: scrub)
    } badges: { momentumBadges(b.marketVision) }
  }

  @ViewBuilder private func momentumBadges(_ mv: MarketVisionResult) -> some View {
    let rsi = mv.series.rsi.lastFinite
    let mf = mv.series.rsiMfi.lastFinite
    let wt1 = mv.series.wt1.lastFinite, wt2 = mv.series.wt2.lastFinite
    RsiStat(value: rsi)
    if let wt1, let wt2 {
      IndicatorStat(label: "WT", value: wt1 > wt2 ? "↑ Bullish" : (wt1 < wt2 ? "↓ Bearish" : "· Neutral"),
                    tint: wt1 > wt2 ? .gainGreen : (wt1 < wt2 ? .lossRed : .primary))
    } else { IndicatorStat(label: "WT", value: "—", tint: .secondary) }
    if let mf {
      let maxAbs = mv.series.rsiMfi.maxAbsFinite
      IndicatorStat(label: "MF", value: "\(mf > 0 ? "+" : "")\(Int(mf.rounded()))", tint: mf > 0 ? .gainGreen : (mf < 0 ? .lossRed : .primary),
                    status: mf > 0 ? "Inflow" : (mf < 0 ? "Outflow" : nil),
                    meter: .init(value: mf, min: -maxAbs, max: maxAbs, origin: .value(0)))
    } else { IndicatorStat(label: "MF", value: "—", tint: .secondary) }
  }

  private func bollingerCard(_ b: IndicatorBundle, _ charts: IndicatorChartData) -> some View {
    IndicatorCardFrame(title: "Bollinger Bands", description: "Shows RSI relative to its own bands (overextension vs mean).",
                       isPending: store.isIndicatorPending, explainSourceID: explainSourceID(.bollinger), onExplain: { explain = .bollinger }) {
      BollingerBandsChart(data: charts.bollinger, windowDays: store.indicatorWindowDays, scrub: scrub)
    } badges: { bollingerBadges(b.bollinger) }
  }

  @ViewBuilder private func bollingerBadges(_ bb: BollingerBands.Result) -> some View {
    RsiStat(value: bb.indicator.lastFinite)
    if let pb = bb.percentB {
      IndicatorStat(label: "%B", value: String(format: "%.2f", pb), tint: pb > 1 ? .lossRed : (pb < 0 ? .gainGreen : .primary),
                    status: pb > 1 ? "Above upper" : (pb < 0 ? "Below lower" : "Inside"),
                    meter: .init(value: pb, min: 0, max: 1, origin: .min), meterTint: (pb > 1 || pb < 0) ? nil : .orange)
    } else { IndicatorStat(label: "%B", value: "—", tint: .secondary) }
  }

  private func volatilityCard(_ b: IndicatorBundle, _ charts: IndicatorChartData) -> some View {
    IndicatorCardFrame(title: "Volatility", description: "Percentile rank of bandwidth (detects compression vs expansion).",
                       isPending: store.isIndicatorPending, explainSourceID: explainSourceID(.bbwp), onExplain: { explain = .bbwp }) {
      BBWPChart(data: charts.bbwp, windowDays: store.indicatorWindowDays, scrub: scrub)
    } badges: { bbwpBadges(b.bbwp) }
  }

  @ViewBuilder private func bbwpBadges(_ r: BBWP.Result) -> some View {
    if let v = r.bbwp.lastFinite {
      let squeeze = v <= 20, expansion = v >= 80
      IndicatorStat(label: "BBWP", value: "\(Int(v.rounded()))", tint: squeeze ? .orange : (expansion ? .lossRed : .primary),
                    status: squeeze ? "Compression" : (expansion ? "Expansion" : "Normal"),
                    meter: .init(value: v, min: 0, max: 100, origin: .min), meterTint: (squeeze || expansion) ? nil : .orange)
    } else { IndicatorStat(label: "BBWP", value: "—", tint: .secondary) }
  }

  private func divergencesCard(_ b: IndicatorBundle, _ charts: IndicatorChartData) -> some View {
    IndicatorCardFrame(title: "Divergences", description: "Compares RSI pivots against price pivots to flag bullish and bearish divergence.",
                       isPending: store.isIndicatorPending, explainSourceID: explainSourceID(.rsi), onExplain: { explain = .rsi }) {
      RsiDivergencesChart(data: charts.rsi, windowDays: store.indicatorWindowDays, scrub: scrub)
    } badges: { divergenceBadges(b.rsiDivergences) }
  }

  @ViewBuilder private func divergenceBadges(_ r: RsiDivergences.Result) -> some View {
    RsiStat(value: r.rsiSeries.lastFinite)
    IndicatorStat(label: "Sig", value: r.signalCurrent.map { "\(Int($0.rounded()))" } ?? "—", tint: r.signalCurrent == nil ? .secondary : .primary)
    let type = r.divergences.last?.type
    IndicatorStat(label: "Div", value: type.map { divLabel($0) } ?? "—", tint: type == nil ? .secondary : (type!.isBullish ? .gainGreen : .lossRed))
    IndicatorStat(label: "Sig Cross", value: r.reverseSignalCross.map { "@ \(UsdFormat.price($0))" } ?? "—", tint: r.reverseSignalCross == nil ? .secondary : .orange)
    ForEach(r.reverseLevels, id: \.target) { lvl in
      IndicatorStat(label: "\(zoneLabel(lvl.target)) \(Int(lvl.target))", value: lvl.price.map { "@ \(UsdFormat.price($0))" } ?? "—",
                    tint: lvl.price == nil ? .secondary : (lvl.target >= 62 ? .lossRed : (lvl.target <= 38 ? .gainGreen : .primary)))
    }
  }

  private func divLabel(_ t: DivergenceType) -> String {
    switch t { case .bullish: "Bull"; case .bearish: "Bear"; case .h_bullish: "H Bull"; case .h_bearish: "H Bear" }
  }
  private func zoneLabel(_ target: Double) -> String {
    switch Int(target) { case 80: "Crit Bull"; case 62: "Ctrl Bull"; case 50: "Mid"; case 38: "Ctrl Bear"; case 20: "Crit Bear"; default: "RSI" }
  }

  // MARK: Explain

  private var marketContext: IndicatorExplainRequest.MarketContext {
    let bars = store.indicators?.explainBars ?? []
    return .init(priceUsd: store.alignedPrice ?? quote?.currentPrice, change24hPct: quote?.priceChangePercentage24h, volume24hUsd: quote?.totalVolume,
                 marketCapUsd: quote?.marketCap, closeHistory: bars.map(\.close), closeTimesUtc: bars.map(\.time))
  }

  private var tokenRef: IndicatorExplainRequest.Token { .init(coinId: coinId, name: quote?.name, symbol: quote?.symbol) }

  private func request(_ target: ExplainTarget, _ b: IndicatorBundle) -> IndicatorExplainRequest {
    let snapshot: IndicatorExplainRequest.Snapshot
    switch target {
    case .marketVision:
      let mv = b.explainMarketVision.series
      snapshot = .marketVision(rsiCurrent: mv.rsi.lastFinite, rsiHistory: mv.rsi.nullableValues, wt1Current: mv.wt1.lastFinite, wt2Current: mv.wt2.lastFinite,
                               moneyFlowCurrent: mv.rsiMfi.lastFinite, moneyFlowHistory: mv.rsiMfi.nullableValues)
    case .bollinger:
      let bb = b.explainBollinger
      snapshot = .bollinger(indicatorCurrent: bb.indicator.lastFinite, upperCurrent: bb.upper.lastFinite, lowerCurrent: bb.lower.lastFinite, basisCurrent: bb.basis.lastFinite,
                            indicatorHistory: bb.indicator.nullableValues, upperHistory: bb.upper.nullableValues, lowerHistory: bb.lower.nullableValues)
    case .bbwp:
      snapshot = .bbwp(bbwpCurrent: b.explainBBWP.bbwp.lastFinite, bbwpHistory: b.explainBBWP.bbwp.nullableValues, lookback: BBWP.Config.default.lookback)
    case .rsi:
      let r = b.explainRsiDivergences
      let c = RsiDivergences.Config.default
      snapshot = .rsiDivergences(
        rsiCurrent: r.rsiSeries.lastFinite, rsiHistory: r.rsiSeries.nullableValues,
        divergences: r.divergences.map { .init(type: $0.type.rawValue, startTime: $0.startTime, endTime: $0.endTime, priceStart: $0.priceStart, priceEnd: $0.priceEnd, rsiStart: $0.rsiStart, rsiEnd: $0.rsiEnd) },
        reverseLevels: r.reverseLevels.map { .init(target: $0.target, price: $0.price) },
        signalCurrent: r.signalCurrent, reverseSignalCross: r.reverseSignalCross,
        settings: .init(rsiLength: c.rsiLength, leftBars: c.leftBars, rightBars: c.rightBars, pairMode: c.pairMode.rawValue, tolBars: c.tolBars, priceMode: c.priceMode.rawValue,
                        allowEqual: c.allowEqual, priceEps: c.priceEps, rsiEps: c.rsiEps, showRegular: c.showRegular, showHidden: c.showHidden,
                        signalPeriod: c.signalPeriod, signalType: c.signalType.rawValue, alertHigh: c.alertHigh, alertLow: c.alertLow))
    }
    return IndicatorExplainRequest(token: tokenRef, timeframe: store.indicatorScale.rawValue, marketContext: marketContext, snapshot: snapshot)
  }

  @ViewBuilder private func explainPage(_ target: ExplainTarget, _ b: IndicatorBundle, _ charts: IndicatorChartData, close: @escaping () -> Void) -> some View {
    let req = request(target, b)
    let days = store.indicatorWindowDays
    switch target {
    case .marketVision:
      IndicatorExplainPage(title: "Momentum & Money Flow", request: req, quote: quote, coinId: coinId, close: close) {
        MarketVisionChart(data: charts.marketVision, windowDays: days, scrub: explainScrub, height: 220)
      } badges: { momentumBadges(b.marketVision) }
    case .bollinger:
      IndicatorExplainPage(title: "Bollinger Bands", request: req, quote: quote, coinId: coinId, close: close) {
        BollingerBandsChart(data: charts.bollinger, windowDays: days, scrub: explainScrub, height: 220)
      } badges: { bollingerBadges(b.bollinger) }
    case .bbwp:
      IndicatorExplainPage(title: "Volatility", request: req, quote: quote, coinId: coinId, close: close) {
        BBWPChart(data: charts.bbwp, windowDays: days, scrub: explainScrub, height: 220)
      } badges: { bbwpBadges(b.bbwp) }
    case .rsi:
      IndicatorExplainPage(title: "RSI Divergences", request: req, quote: quote, coinId: coinId, close: close) {
        RsiDivergencesChart(data: charts.rsi, windowDays: days, scrub: explainScrub, height: 220)
      } badges: { divergenceBadges(b.rsiDivergences) }
    }
  }
}

// MARK: - Card frame + stats

/// `IndicatorCardFrame`: title/description + Explain trigger, chart body, stats strip.
struct IndicatorCardFrame<ChartView: View, Badges: View>: View {
  let title: String
  let description: String
  let isPending: Bool
  /// Registers the Explain button as the zoom / collapse anchor for its explanation page.
  var explainSourceID: String? = nil
  let onExplain: () -> Void
  @ViewBuilder let chart: () -> ChartView
  @ViewBuilder let badges: () -> Badges

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(.subheadline, design: .rounded, weight: .semibold))
          Text(description).font(.system(.caption, design: .rounded)).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
        Button(action: onExplain) {
          Image("ActionAnalyze").renderingMode(.template).resizable().scaledToFit()
            .frame(width: 14, height: 14).frame(width: 30, height: 30)
        }
          .buttonStyle(.glass)
          .buttonBorderShape(.circle)
          .tokenTransitionSource(explainSourceID ?? "indicator-explain|\(title)", cornerRadius: 15)
          .accessibilityLabel("Explain \(title)")
          .disabled(isPending)
      }
      chart()
      IndicatorStatsLayout(spacing: 12, rowSpacing: 8) { badges() }
        .padding(.horizontal, 4)
      .padding(.top, 6)
      .overlay(alignment: .top) { Divider().opacity(0.6) }
    }
    .padding(.vertical, 12)
    .opacity(isPending ? 0.9 : 1)
  }
}

/// Web's wrapping stats strip: all readouts stay discoverable on a narrow screen. Subview sizes
/// and the last wrap are kept in the layout cache, so size and place passes measure nothing twice.
private struct IndicatorStatsLayout: Layout {
  let spacing: CGFloat
  let rowSpacing: CGFloat

  struct Cache {
    var sizes: [CGSize]
    var width: CGFloat = -1
    var origins: [CGPoint] = []
    var height: CGFloat = 0
  }

  func makeCache(subviews: Subviews) -> Cache { Cache(sizes: subviews.map { $0.sizeThatFits(.unspecified) }) }
  func updateCache(_ cache: inout Cache, subviews: Subviews) { cache = makeCache(subviews: subviews) }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
    let width = proposal.width ?? 350
    wrap(&cache, width: width)
    return CGSize(width: width, height: cache.height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
    wrap(&cache, width: bounds.width)
    for (view, origin) in zip(subviews, cache.origins) {
      view.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), anchor: .topLeading, proposal: .unspecified)
    }
  }

  private func wrap(_ cache: inout Cache, width: CGFloat) {
    guard cache.width != width || cache.origins.count != cache.sizes.count else { return }
    var origins: [CGPoint] = []
    origins.reserveCapacity(cache.sizes.count)
    var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
    for size in cache.sizes {
      if x > 0 && x + size.width > width { x = 0; y += rowHeight + rowSpacing; rowHeight = 0 }
      origins.append(CGPoint(x: x, y: y))
      x += size.width + spacing
      rowHeight = max(rowHeight, size.height)
    }
    cache.width = width; cache.origins = origins; cache.height = y + rowHeight
  }
}

/// `IndicatorStat`: tiny uppercase label, mono value, optional TickMeter + status.
struct IndicatorStat: View {
  struct Meter { var value: Double; var min: Double; var max: Double; var origin: TickMeter.Origin }
  let label: String
  let value: String
  var tint: Color = .primary
  var status: String? = nil
  var meter: Meter? = nil
  var meterTint: Color? = nil

  var body: some View {
    HStack(spacing: 6) {
      Text(label.uppercased()).font(.system(size: 9)).tracking(0.5).foregroundStyle(.secondary)
      Text(value).font(.number(size: 12, weight: .regular)).foregroundStyle(tint).lineLimit(1)
      if let meter {
        TickMeter(value: meter.value, min: meter.min, max: meter.max, origin: meter.origin, color: meterTint ?? tint)
      }
      if let status { Text(status).font(.system(size: 9)).foregroundStyle(tint) }
    }
    .fixedSize()
  }
}

/// `RsiStat`
struct RsiStat: View {
  let value: Double?
  var body: some View {
    if let v = value {
      let ob = v >= 70, os = v <= 30
      IndicatorStat(label: "RSI", value: "\(Int(v.rounded()))", tint: ob ? .lossRed : (os ? .gainGreen : .primary),
                    status: ob ? "Overbought" : (os ? "Oversold" : nil),
                    meter: .init(value: v, min: 0, max: 100, origin: .min), meterTint: (ob || os) ? nil : .orange)
    } else {
      IndicatorStat(label: "RSI", value: "—", tint: .secondary)
    }
  }
}

#if DEBUG
#Preview("All indicators") {
  PreviewHost { env in
    ScrollView { TokenIndicatorsSection(store: PreviewData.tokenStore(env), coinId: "bitcoin", quote: PreviewFixtures.quotes[0]).padding() }
  }
}
#Preview("Indicator statistics") {
  VStack(spacing: 20) { RsiStat(value: 76); RsiStat(value: 25); RsiStat(value: 52); RsiStat(value: nil) }
    .padding().preferredColorScheme(.dark)
}
#endif
