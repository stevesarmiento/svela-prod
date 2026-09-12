import AggrCore
import Charts
import SwiftUI

/// Port of `marketvision-chart.tsx` (Market Cipher B layout): WaveTrend areas, signed money-flow area,
/// Stoch K/D band, RSI line, OB/OS levels, buy/sell/gold circles and WT divergence segments.
struct MarketVisionChart: View {
  let result: MarketVisionResult
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250

  private let cfg = MarketVisionConfig.default.colors

  var body: some View {
    let wt1 = result.series.wt1.chartPoints
    let wt2 = result.series.wt2.chartPoints
    let mf = result.series.rsiMfi.chartPoints
    let rsi = result.series.rsi.chartPoints
    let stoch = pairBands(result.series.stochK.chartPoints, result.series.stochD.chartPoints)
    let lastDate = wt1.last?.date
    Chart {
      levels
      ForEach(stoch) { p in
        AreaMark(x: .value("t", p.date), yStart: .value("k", p.lower), yEnd: .value("d", p.upper), series: .value("s", "stoch"))
          .foregroundStyle(Color(oklch: cfg.stochK))
      }
      ForEach(wt2) { p in
        AreaMark(x: .value("t", p.date), y: .value("WT2", p.value), series: .value("s", "wt2"))
          .foregroundStyle(Color(oklch: cfg.colorWT2Fill).opacity(0.9))
          .interpolationMethod(.monotone)
      }
      ForEach(wt1) { p in
        AreaMark(x: .value("t", p.date), y: .value("WT1", p.value), series: .value("s", "wt1"))
          .foregroundStyle(Color(oklch: cfg.colorWT1Fill).opacity(0.75))
          .interpolationMethod(.monotone)
      }
      ForEach(mf) { p in
        AreaMark(x: .value("t", p.date), yStart: .value("z", 0), yEnd: .value("MF", max(0, p.value)), series: .value("s", "mf+"))
          .foregroundStyle(Color(oklch: cfg.mfiAbove).opacity(0.55))
        AreaMark(x: .value("t", p.date), yStart: .value("z", 0), yEnd: .value("MF", min(0, p.value)), series: .value("s", "mf-"))
          .foregroundStyle(Color(oklch: cfg.mfiBelow).opacity(0.55))
      }
      ForEach(rsi) { p in
        LineMark(x: .value("t", p.date), y: .value("RSI", p.value), series: .value("s", "rsi"))
          .foregroundStyle(Color(oklch: cfg.rsiInBetween).opacity(0.8)).lineStyle(StrokeStyle(lineWidth: 1))
      }
      signals
      ScrubRule(date: selectedDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(windowDays: windowDays, lastDate: lastDate, yDomain: yDomain(wt1: wt1, wt2: wt2, mf: mf), height: height)
    .chartLegend(.hidden)
  }

  private func yDomain(wt1: [IPt], wt2: [IPt], mf: [IPt]) -> ClosedRange<Double> {
    let values = (wt1 + wt2 + mf).map(\.value)
    let lo = min(-60, values.min() ?? -60), hi = max(60, values.max() ?? 60)
    return (lo - 5)...(hi + 5)
  }

  @ChartContentBuilder private var levels: some ChartContent {
    RuleMark(y: .value("0", 0)).foregroundStyle(Color.white.opacity(0.25)).lineStyle(StrokeStyle(lineWidth: 1))
    RuleMark(y: .value("OB", MarketVisionConfig.default.waveTrend.obLevel)).foregroundStyle(Color.white.opacity(0.15)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
    RuleMark(y: .value("OS", MarketVisionConfig.default.waveTrend.osLevel)).foregroundStyle(Color.white.opacity(0.15)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
  }

  @ChartContentBuilder private var signals: some ChartContent {
    ForEach(result.series.buyCircle.chartPoints) { p in
      PointMark(x: .value("t", p.date), y: .value("v", p.value)).foregroundStyle(Color(oklch: cfg.colorGreen)).symbolSize(28)
    }
    ForEach(result.series.sellCircle.chartPoints) { p in
      PointMark(x: .value("t", p.date), y: .value("v", p.value)).foregroundStyle(Color(oklch: cfg.colorRed)).symbolSize(28)
    }
    ForEach(result.series.goldBuyCircle.chartPoints) { p in
      PointMark(x: .value("t", p.date), y: .value("v", p.value)).foregroundStyle(Color(oklch: cfg.colorYellow)).symbolSize(44)
    }
    ForEach(Array(result.wtDivergences.enumerated()), id: \.offset) { i, d in
      LineMark(x: .value("t", Date(timeIntervalSince1970: TimeInterval(d.startTime))), y: .value("v", d.oscStart), series: .value("s", "div\(i)"))
        .foregroundStyle(Color(oklch: d.type.isBullish ? cfg.wtBullDiv : cfg.wtBearDiv)).lineStyle(StrokeStyle(lineWidth: 1.5))
      LineMark(x: .value("t", Date(timeIntervalSince1970: TimeInterval(d.endTime))), y: .value("v", d.oscEnd), series: .value("s", "div\(i)"))
        .foregroundStyle(Color(oklch: d.type.isBullish ? cfg.wtBullDiv : cfg.wtBearDiv)).lineStyle(StrokeStyle(lineWidth: 1.5))
    }
  }
}
