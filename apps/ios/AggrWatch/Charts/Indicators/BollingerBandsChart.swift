import AggrCore
import Charts
import SwiftUI

/// Port of `bollinger-bands-chart.tsx`: RSI (0–100) inside its own Bollinger band, basis dashed, breaches marked.
struct BollingerBandsChart: View {
  let result: BollingerBands.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250

  var body: some View {
    let ind = result.indicator.chartPoints
    let upper = result.upper.chartPoints
    let band = pairBands(upper, result.lower.chartPoints)
    let basis = result.basis.chartPoints
    let lineColor = Color(oklch: result.isMfi ? BollingerBands.Colors.mfi : BollingerBands.Colors.rsi)
    Chart {
      RuleMark(y: .value("70", 70)).foregroundStyle(Color.white.opacity(0.12)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
      RuleMark(y: .value("30", 30)).foregroundStyle(Color.white.opacity(0.12)).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
      ForEach(band) { p in
        AreaMark(x: .value("t", p.date), yStart: .value("lower", p.lower), yEnd: .value("upper", p.upper), series: .value("s", "band"))
          .foregroundStyle(Color(oklch: BollingerBands.Colors.bands).opacity(0.10))
          .interpolationMethod(.monotone)
      }
      ForEach(upper) { p in
        LineMark(x: .value("t", p.date), y: .value("Upper", p.value), series: .value("s", "upper"))
          .foregroundStyle(Color(oklch: BollingerBands.Colors.bands).opacity(0.7)).lineStyle(StrokeStyle(lineWidth: 1)).interpolationMethod(.monotone)
      }
      ForEach(result.lower.chartPoints) { p in
        LineMark(x: .value("t", p.date), y: .value("Lower", p.value), series: .value("s", "lower"))
          .foregroundStyle(Color(oklch: BollingerBands.Colors.bands).opacity(0.7)).lineStyle(StrokeStyle(lineWidth: 1)).interpolationMethod(.monotone)
      }
      ForEach(basis) { p in
        LineMark(x: .value("t", p.date), y: .value("Basis", p.value), series: .value("s", "basis"))
          .foregroundStyle(Color(oklch: BollingerBands.Colors.basis).opacity(0.8)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3])).interpolationMethod(.monotone)
      }
      ForEach(ind) { p in
        LineMark(x: .value("t", p.date), y: .value("RSI", p.value), series: .value("s", "ind"))
          .foregroundStyle(lineColor).lineStyle(StrokeStyle(lineWidth: 2)).interpolationMethod(.monotone)
      }
      ForEach(result.overboughtBreaches.chartPoints) { p in
        PointMark(x: .value("t", p.date), y: .value("v", p.value)).foregroundStyle(Color.lossRed).symbolSize(20)
      }
      ForEach(result.oversoldBreaches.chartPoints) { p in
        PointMark(x: .value("t", p.date), y: .value("v", p.value)).foregroundStyle(Color.gainGreen).symbolSize(20)
      }
      ScrubRule(date: selectedDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(windowDays: windowDays, lastDate: ind.last?.date, yDomain: 0...100, height: height)
    .chartLegend(.hidden)
  }
}

#if DEBUG
#Preview("Indicator chart") {
  PreviewValue(Date?.none) { date in
    BollingerBandsChart(result: PreviewFixtures.indicators.bollinger, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
