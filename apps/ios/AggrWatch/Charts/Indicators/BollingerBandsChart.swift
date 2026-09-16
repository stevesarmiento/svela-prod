import AggrCore
import Charts
import SwiftUI

/// Web parity: muted dotted bands, dashed basis, RSI and prominent breach dots.
struct BollingerBandsChart: View {
  let result: BollingerBands.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250
  @State private var viewport = IndicatorViewport()

  var body: some View {
    let indicator = result.indicator.chartPoints
    let window = viewport.window(points: indicator, days: windowDays)
    let upper = result.upper.chartPoints, lower = result.lower.chartPoints, basis = result.basis.chartPoints
    let domain = IndicatorPlotScale.domain(points: result.indicator + result.upper + result.lower, visible: window.epochs)
    let scrubDate = indicator.nearest(to: selectedDate)?.date
    Chart {
      IndicatorLine(id: "upper", points: upper.visible(in: window), color: Color(oklch: "oklch(0.7118 0.0129 286.07 / 0.46)"), dash: [1, 3])
      IndicatorLine(id: "lower", points: lower.visible(in: window), color: Color(oklch: "oklch(0.7118 0.0129 286.07 / 0.46)"), dash: [1, 3])
      IndicatorLine(id: "basis", points: basis.visible(in: window), color: Color(oklch: "oklch(0.7118 0.0129 286.07 / 0.75)"), dash: [4, 4])
      IndicatorLine(id: "RSI", points: indicator.visible(in: window), color: Color(oklch: result.isMfi ? BollingerBands.Colors.mfi : BollingerBands.Colors.rsi), width: 2)
      IndicatorDots(points: result.overboughtBreaches.chartPoints.visible(in: window), color: Color(oklch: "oklch(0.645 0.2154 16.44 / 0.95)"), diameter: 8)
      IndicatorDots(points: result.oversoldBreaches.chartPoints.visible(in: window), color: Color(oklch: "oklch(0.6959 0.1491 162.48 / 0.95)"), diameter: 8)
      ScrubRule(date: scrubDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height)
    .chartLegend(.hidden)
    .overlay(alignment: .topLeading) {
      IndicatorReadout(date: scrubDate, series: [(result.isMfi ? "MFI" : "RSI", indicator), ("Upper", upper), ("Basis", basis), ("Lower", lower)])
    }
    .accessibilityIdentifier("indicator-bollinger")
  }
}

#if DEBUG
#Preview("Bollinger — web parity") {
  PreviewValue(Date?.none) { date in
    BollingerBandsChart(result: PreviewFixtures.indicators.bollinger, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
