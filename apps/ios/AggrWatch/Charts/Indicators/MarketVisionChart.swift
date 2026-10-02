import AggrCore
import Charts
import SwiftUI

/// Market Vision series converted once per bundle: uncolored line copies, scaled money flow,
/// merged divergence markers and resolved bar / flag tints.
nonisolated struct MarketVisionChartData: Sendable, Equatable {
  nonisolated struct StochPt: Identifiable, Hashable, Sendable, TimedMark { let id: Int; let date: Date; let k: Double; let d: Double }

  let id = UUID()
  let anchor: [IPt]
  let wt1: [IPt], wt2: [IPt], vwap: [IPt]
  let moneyFlow: [IPt], moneyFlowPositive: [IPt], moneyFlowNegative: [IPt], moneyFlowLine: [IPt]
  let rsi: [IPt]
  let stochK: [IPt], stochD: [IPt], stoch: [StochPt]
  let mfiBars: [TintedPt]
  let tc: [IPt], sommiHvwap: [IPt]
  let wtCross: [IPt], wtDivergences: [IPt], rsiDivergences: [IPt], stochDivergences: [IPt]
  let buy: [IPt], sell: [IPt], divBuy: [IPt], divSell: [IPt], goldBuy: [IPt]
  let flags: [TintedPt], diamonds: [TintedPt]
  let domainSeries: [[IPt]]
  let readout: [(String, [IPt])]

  init(_ result: MarketVisionResult) {
    let cfg = MarketVisionConfig.default.colors
    let s = result.series
    func uncolored(_ points: [ColoredPoint]) -> [IPt] { points.compactMap { $0.value.isFinite ? IPt(time: $0.time, value: $0.value) : nil } }
    anchor = result.zeroLevel.chartPoints
    wt1 = uncolored(s.wt1); wt2 = uncolored(s.wt2); vwap = uncolored(s.wtVwap)
    let mf = uncolored(s.rsiMfi).map { IPt(time: $0.id, value: $0.value * 0.6) }
    moneyFlow = mf
    moneyFlowPositive = mf.map { IPt(time: $0.id, value: max(0, $0.value)) }
    moneyFlowNegative = mf.map { IPt(time: $0.id, value: min(0, $0.value)) }
    moneyFlowLine = mf.map { IPt(time: $0.id, value: $0.value, color: OklchColor.withAlpha($0.value >= 0 ? cfg.mfiAbove : cfg.mfiBelow, 0.75)) }
    rsi = s.rsi.chartPoints.map { IPt(time: $0.id, value: $0.value, color: OklchColor.withAlpha($0.color ?? cfg.rsiInBetween, 0.75)) }
    stochK = s.stochK.chartPoints; stochD = s.stochD.chartPoints
    let dByTime = Dictionary(stochD.map { ($0.id, $0.value) }, uniquingKeysWith: { a, _ in a })
    stoch = stochK.compactMap { p in dByTime[p.id].map { StochPt(id: p.id, date: p.date, k: p.value, d: $0) } }
    mfiBars = s.mfiBarTop.filter { $0.value.isFinite }.map { TintedPt($0, fallback: cfg.colorWhite, alpha: 0.25) }
    tc = uncolored(s.tc); sommiHvwap = s.sommiHvwap.chartPoints
    wtCross = s.wtCrossCircles.chartPoints
    wtDivergences = .merged(s.wtBearDiv, s.wtBullDiv, s.wtBearDiv2, s.wtBullDiv2)
    rsiDivergences = .merged(s.rsiBearDiv, s.rsiBullDiv)
    stochDivergences = .merged(s.stochBearDiv, s.stochBullDiv)
    buy = s.buyCircle.chartPoints; sell = s.sellCircle.chartPoints
    divBuy = s.divBuyCircle.chartPoints; divSell = s.divSellCircle.chartPoints; goldBuy = s.goldBuyCircle.chartPoints
    flags = (s.sommiBearFlag + s.sommiBullFlag).filter { $0.value.isFinite }.sorted { $0.time < $1.time }.map { TintedPt($0, fallback: cfg.colorWhite) }
    diamonds = (s.sommiBearDiamond + s.sommiBullDiamond).filter { $0.value.isFinite }.sorted { $0.time < $1.time }.map { TintedPt($0, fallback: cfg.colorWhite) }
    domainSeries = [wt1, wt2, vwap, moneyFlow, rsi, stochK, stochD, tc, sommiHvwap]
    readout = [("WT1", wt1), ("WT2", wt2), ("Money Flow", s.rsiMfi.chartPoints), ("RSI", s.rsi.chartPoints)]
  }

  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}

/// The web Market Vision layer order and visual scaling, independent of its raw analytics.
struct MarketVisionChart: View {
  let data: MarketVisionChartData
  let windowDays: Int
  var height: CGFloat = 250
  private let sharedScrub: IndicatorScrubStore?
  private let external: Binding<Date?>?
  @State private var ownScrub = IndicatorScrubStore()
  @State private var selection: Date?
  @State private var viewport = IndicatorViewport()

  init(data: MarketVisionChartData, windowDays: Int, scrub: IndicatorScrubStore, height: CGFloat = 250) {
    self.data = data; self.windowDays = windowDays; self.height = height
    sharedScrub = scrub; external = nil
  }

  /// Unprepared input with a plain selection binding (previews, one-off hosts).
  init(result: MarketVisionResult, windowDays: Int, selectedDate: Binding<Date?>, height: CGFloat = 250) {
    data = MarketVisionChartData(result); self.windowDays = windowDays; self.height = height
    sharedScrub = nil; external = selectedDate
  }

  private var scrub: IndicatorScrubStore { sharedScrub ?? ownScrub }

  var body: some View {
    let window = viewport.window(points: data.anchor, days: windowDays)
    let domain = IndicatorYDomain.compute(series: data.domainSeries, visible: window.epochs, anchors: [-108, 108])
    MarketVisionPlot(data: data, window: window)
      .equatable()
      .indicatorScrub(selection: $selection, scrub: scrub, anchor: data.anchor, external: external)
      .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height, horizontalGrid: false)
      .chartLegend(.hidden)
      .overlay(alignment: .topLeading) { IndicatorReadout(scrub: scrub, series: data.readout) }
      .accessibilityIdentifier("indicator-market-vision")
  }
}

/// Marks only: re-diffed when the prepared data or the visible window change, never on scrub.
private struct MarketVisionPlot: View, Equatable {
  let data: MarketVisionChartData
  let window: IndicatorWindow

  private static let cfg = MarketVisionConfig.default.colors
  private static let wt1Fill = Color(oklch: cfg.colorWT1Fill).opacity(0.35)
  private static let wt1Line = Color(oklch: cfg.colorWT1Fill).opacity(0.7)
  private static let wt2Fill = Color(oklch: cfg.colorWT2Fill).opacity(0.35)
  private static let wt2Line = Color(oklch: cfg.colorWT1Fill).opacity(0.8)
  private static let mfiAbove = Color(oklch: cfg.mfiAbove).opacity(0.5)
  private static let mfiBelow = Color(oklch: cfg.mfiBelow).opacity(0.5)
  private static let tcLine = Color(oklch: "oklch(0.4742 0.1862 294.78 / 0.75)")
  private static let stochUp = Color(oklch: "oklch(0.7404 0.142 230.37 / 0.05)")
  private static let stochDown = Color(oklch: "oklch(0.4742 0.1862 294.78 / 0.1)")
  private static let green = Color(oklch: cfg.colorGreen)
  private static let red = Color(oklch: cfg.colorRed)
  private static let yellow = Color(oklch: cfg.colorYellow)

  var body: some View {
    let epochs = window.epochs
    let wt1 = data.wt1.visible(in: window)
    let wt2 = data.wt2.visible(in: window)
    let vwap = data.vwap.visible(in: window)
    let k = data.stochK.visible(in: window), d = data.stochD.visible(in: window)
    let tc = data.tc.visible(in: window)
    Chart {
      RuleMark(y: .value("Zero", 0)).foregroundStyle(Color.white.opacity(0.3765))
      IndicatorArea(id: "wt1-fill", points: wt1, color: Self.wt1Fill)
      IndicatorLine(id: "WT1", points: wt1, color: Self.wt1Line, width: 2)
      IndicatorArea(id: "wt2-fill", points: wt2, color: Self.wt2Fill)
      IndicatorLine(id: "WT2", points: wt2, color: Self.wt2Line)
      IndicatorArea(id: "vwap-fill", points: vwap, color: .white.opacity(0.25))
      IndicatorLine(id: "Fast WT", points: vwap, color: .white.opacity(0.55))
      IndicatorArea(id: "mf-positive", points: data.moneyFlowPositive.visible(in: window), color: Self.mfiAbove)
      IndicatorArea(id: "mf-negative", points: data.moneyFlowNegative.visible(in: window), color: Self.mfiBelow)
      IndicatorLine(id: "Money Flow", points: data.moneyFlowLine.visible(in: window))
      ForEach(data.mfiBars.within(epochs)) { p in
        BarMark(x: .value("Time", p.date), yStart: .value("Bottom", -99), yEnd: .value("Top", p.value), width: .ratio(1))
          .foregroundStyle(p.tint)
      }
      IndicatorLine(id: "RSI", points: data.rsi.visible(in: window), width: 2)
      ForEach(data.stoch.visibleSlice(in: window)) { p in
        AreaMark(x: .value("Time", p.date), yStart: .value("D", p.d), yEnd: .value("K above", max(p.d, p.k)), series: .value("Area", "stoch-up"))
          .foregroundStyle(Self.stochUp)
        AreaMark(x: .value("Time", p.date), yStart: .value("K below", min(p.d, p.k)), yEnd: .value("D", p.d), series: .value("Area", "stoch-down"))
          .foregroundStyle(Self.stochDown)
      }
      IndicatorLine(id: "Stoch K", points: k, width: 2)
      IndicatorLine(id: "Stoch D", points: d)
      IndicatorLine(id: "TC", points: tc, color: Self.tcLine, width: 2)
      IndicatorLine(id: "TC highlight", points: tc, color: .white.opacity(0.5))
      RuleMark(y: .value("Overbought", 60)).foregroundStyle(Color.white.opacity(0.15))
      RuleMark(y: .value("Oversold", -60)).foregroundStyle(Color.white.opacity(0.15))
      RuleMark(y: .value("Upper guide", 100)).foregroundStyle(Color.white.opacity(0.05)).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      signals
      IndicatorLine(id: "Sommi HVWAP", points: data.sommiHvwap.visible(in: window), color: Self.yellow, width: 2)
    }
  }

  @ChartContentBuilder private var signals: some ChartContent {
    let epochs = window.epochs
    IndicatorDots(points: data.wtCross.visible(in: window), color: .white, diameter: 6)
    IndicatorDots(points: Array(data.wtDivergences.within(epochs)), color: .white)
    IndicatorDots(points: Array(data.rsiDivergences.within(epochs)), color: .white, diameter: 4)
    IndicatorDots(points: Array(data.stochDivergences.within(epochs)), color: .white, diameter: 4)
    IndicatorDots(points: data.buy.visible(in: window), color: Self.green, diameter: 7, opacity: 0.5)
    IndicatorDots(points: data.sell.visible(in: window), color: Self.red, diameter: 7, opacity: 0.5)
    IndicatorDots(points: data.divBuy.visible(in: window), color: Self.green, diameter: 8, opacity: 0.85)
    IndicatorDots(points: data.divSell.visible(in: window), color: Self.red, diameter: 8, opacity: 0.85)
    IndicatorDots(points: data.goldBuy.visible(in: window), color: Self.yellow, diameter: 10, opacity: 0.85)
    ForEach(data.flags.within(epochs)) { p in
      PointMark(x: .value("Time", p.date), y: .value("Flag", p.value)).symbol {
        Image(systemName: "flag.fill").font(.system(size: 10)).foregroundStyle(p.tint)
      }
    }
    ForEach(data.diamonds.within(epochs)) { p in
      PointMark(x: .value("Time", p.date), y: .value("Diamond", p.value)).symbol(.diamond).symbolSize(25).foregroundStyle(p.tint)
    }
  }

  static func == (a: Self, b: Self) -> Bool { a.data == b.data && a.window == b.window }
}

#if DEBUG
#Preview("Market Vision — web parity") {
  PreviewValue(Date?.none) { date in
    MarketVisionChart(result: PreviewFixtures.indicators.marketVision, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
