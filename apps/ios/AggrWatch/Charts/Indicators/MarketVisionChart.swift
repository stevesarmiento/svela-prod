import AggrCore
import Charts
import SwiftUI

/// The web Market Vision layer order and visual scaling, independent of its raw analytics.
struct MarketVisionChart: View {
  let result: MarketVisionResult
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250
  @State private var viewport = IndicatorViewport()
  private let cfg = MarketVisionConfig.default.colors

  var body: some View {
    let series = result.series
    let window = viewport.window(points: result.zeroLevel.chartPoints, days: windowDays)
    let wt1 = series.wt1.chartPoints.visible(in: window)
    let wt2 = series.wt2.chartPoints.visible(in: window)
    let vwap = series.wtVwap.chartPoints.visible(in: window)
    let mf = series.rsiMfi.chartPoints.visible(in: window).map { p in IPt(time: p.id, value: p.value * 0.6) }
    let rsi = series.rsi.chartPoints.visible(in: window).map { p in
      var point = p; point.color = OklchColor.withAlpha(p.color ?? cfg.rsiInBetween, 0.75); return point
    }
    let k = series.stochK.chartPoints.visible(in: window), d = series.stochD.chartPoints.visible(in: window)
    let domainPoints = (wt1 + wt2 + vwap + mf + rsi + k + d + series.tc.chartPoints + series.sommiHvwap.chartPoints).timePoints
    let domain = IndicatorPlotScale.domain(points: domainPoints, visible: window.epochs, anchors: [-108, 108])
    let scrubDate = result.zeroLevel.chartPoints.nearest(to: selectedDate)?.date
    Chart {
      RuleMark(y: .value("Zero", 0)).foregroundStyle(Color.white.opacity(0.3765))
      IndicatorArea(id: "wt1-fill", points: wt1, color: Color(oklch: cfg.colorWT1Fill).opacity(0.35))
      IndicatorLine(id: "WT1", points: uncolored(wt1), color: Color(oklch: cfg.colorWT1Fill).opacity(0.7), width: 2)
      IndicatorArea(id: "wt2-fill", points: wt2, color: Color(oklch: cfg.colorWT2Fill).opacity(0.35))
      IndicatorLine(id: "WT2", points: uncolored(wt2), color: Color(oklch: cfg.colorWT1Fill).opacity(0.8))
      IndicatorArea(id: "vwap-fill", points: vwap, color: .white.opacity(0.25))
      IndicatorLine(id: "Fast WT", points: uncolored(vwap), color: .white.opacity(0.55))
      moneyFlow(points: mf)
      ForEach(series.mfiBarTop.chartPoints.visible(in: window)) { p in
        BarMark(x: .value("Time", p.date), yStart: .value("Bottom", -99), yEnd: .value("Top", p.value), width: .ratio(1))
          .foregroundStyle(Color(oklch: OklchColor.withAlpha(p.color ?? cfg.colorWhite, 0.25)))
      }
      IndicatorLine(id: "RSI", points: rsi, width: 2)
      stochFill(k: k, d: d)
      IndicatorLine(id: "Stoch K", points: k, width: 2)
      IndicatorLine(id: "Stoch D", points: d)
      IndicatorLine(id: "TC", points: uncolored(series.tc.chartPoints.visible(in: window)), color: Color(oklch: "oklch(0.4742 0.1862 294.78 / 0.75)"), width: 2)
      IndicatorLine(id: "TC highlight", points: uncolored(series.tc.chartPoints.visible(in: window)), color: .white.opacity(0.5))
      RuleMark(y: .value("Overbought", 60)).foregroundStyle(Color.white.opacity(0.15))
      RuleMark(y: .value("Oversold", -60)).foregroundStyle(Color.white.opacity(0.15))
      RuleMark(y: .value("Upper guide", 100)).foregroundStyle(Color.white.opacity(0.05)).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      signals(window: window)
      IndicatorLine(id: "Sommi HVWAP", points: series.sommiHvwap.chartPoints.visible(in: window), color: Color(oklch: cfg.colorYellow), width: 2)
      ScrubRule(date: scrubDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height, horizontalGrid: false)
    .chartLegend(.hidden)
    .overlay(alignment: .topLeading) {
      IndicatorReadout(date: scrubDate, series: [("WT1", series.wt1.chartPoints), ("WT2", series.wt2.chartPoints), ("Money Flow", series.rsiMfi.chartPoints), ("RSI", series.rsi.chartPoints)])
    }
    .accessibilityIdentifier("indicator-market-vision")
  }

  private func uncolored(_ points: [IPt]) -> [IPt] { points.map { IPt(time: $0.id, value: $0.value) } }

  @ChartContentBuilder private func moneyFlow(points: [IPt]) -> some ChartContent {
    IndicatorArea(id: "mf-positive", points: points.map { IPt(time: $0.id, value: max(0, $0.value)) }, color: Color(oklch: cfg.mfiAbove).opacity(0.5))
    IndicatorArea(id: "mf-negative", points: points.map { IPt(time: $0.id, value: min(0, $0.value)) }, color: Color(oklch: cfg.mfiBelow).opacity(0.5))
    IndicatorLine(id: "Money Flow", points: points.map { p in
      var point = p; point.color = OklchColor.withAlpha(p.value >= 0 ? cfg.mfiAbove : cfg.mfiBelow, 0.75); return point
    })
  }

  @ChartContentBuilder private func stochFill(k: [IPt], d: [IPt]) -> some ChartContent {
    let byTime = Dictionary(d.map { ($0.id, $0.value) }, uniquingKeysWith: { a, _ in a })
    ForEach(k) { p in
      if let value = byTime[p.id] {
        AreaMark(x: .value("Time", p.date), yStart: .value("D", value), yEnd: .value("K above", max(value, p.value)), series: .value("Area", "stoch-up"))
          .foregroundStyle(Color(oklch: "oklch(0.7404 0.142 230.37 / 0.05)"))
        AreaMark(x: .value("Time", p.date), yStart: .value("K below", min(value, p.value)), yEnd: .value("D", value), series: .value("Area", "stoch-down"))
          .foregroundStyle(Color(oklch: "oklch(0.4742 0.1862 294.78 / 0.1)"))
      }
    }
  }

  @ChartContentBuilder private func signals(window: IndicatorWindow) -> some ChartContent {
    let s = result.series
    IndicatorDots(points: s.wtCrossCircles.chartPoints.visible(in: window), color: .white, diameter: 6)
    IndicatorDots(points: (s.wtBearDiv + s.wtBullDiv + s.wtBearDiv2 + s.wtBullDiv2).sorted { $0.time < $1.time }.chartPoints.filter { window.epochs.contains($0.id) }, color: .white)
    IndicatorDots(points: (s.rsiBearDiv + s.rsiBullDiv).sorted { $0.time < $1.time }.chartPoints.filter { window.epochs.contains($0.id) }, color: .white, diameter: 4)
    IndicatorDots(points: (s.stochBearDiv + s.stochBullDiv).sorted { $0.time < $1.time }.chartPoints.filter { window.epochs.contains($0.id) }, color: .white, diameter: 4)
    IndicatorDots(points: s.buyCircle.chartPoints.visible(in: window), color: Color(oklch: cfg.colorGreen), diameter: 7, opacity: 0.5)
    IndicatorDots(points: s.sellCircle.chartPoints.visible(in: window), color: Color(oklch: cfg.colorRed), diameter: 7, opacity: 0.5)
    IndicatorDots(points: s.divBuyCircle.chartPoints.visible(in: window), color: Color(oklch: cfg.colorGreen), diameter: 8, opacity: 0.85)
    IndicatorDots(points: s.divSellCircle.chartPoints.visible(in: window), color: Color(oklch: cfg.colorRed), diameter: 8, opacity: 0.85)
    IndicatorDots(points: s.goldBuyCircle.chartPoints.visible(in: window), color: Color(oklch: cfg.colorYellow), diameter: 10, opacity: 0.85)
    ForEach((s.sommiBearFlag + s.sommiBullFlag).chartPoints.filter { window.epochs.contains($0.id) }) { p in
      PointMark(x: .value("Time", p.date), y: .value("Flag", p.value)).symbol {
        Image(systemName: "flag.fill").font(.system(size: 10)).foregroundStyle(Color(oklch: p.color ?? cfg.colorWhite))
      }
    }
    ForEach((s.sommiBearDiamond + s.sommiBullDiamond).chartPoints.filter { window.epochs.contains($0.id) }) { p in
      PointMark(x: .value("Time", p.date), y: .value("Diamond", p.value)).symbol(.diamond).symbolSize(25).foregroundStyle(Color(oklch: p.color ?? cfg.colorWhite))
    }
  }
}

#if DEBUG
#Preview("Market Vision — web parity") {
  PreviewValue(Date?.none) { date in
    MarketVisionChart(result: PreviewFixtures.indicators.marketVision, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
