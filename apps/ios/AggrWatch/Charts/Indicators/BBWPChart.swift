import AggrCore
import Charts
import SwiftUI

/// Web's per-value OKLCH spectrum, 0/50/100 scale guides, 2/98 extremes and dashed MA.
struct BBWPChart: View {
  let result: BBWP.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250
  @State private var viewport = IndicatorViewport()
  private static let palette = (0...100).map { IndicatorPlotScale.volatilityColor(Double($0)) }

  var body: some View {
    let line = result.bbwp.chartPoints
    let ma = result.ma.chartPoints
    let window = viewport.window(points: line, days: windowDays)
    let colored = line.visible(in: window).map { p in
      var point = p; point.color = Self.palette[min(100, max(0, Int(p.value.rounded())))]; return point
    }
    let scrubDate = line.nearest(to: selectedDate)?.date
    Chart {
      RuleMark(y: .value("100", 100)).foregroundStyle(Color(oklch: "oklch(0.628 0.2577 29.23 / 0.16)"))
      RuleMark(y: .value("0", 0)).foregroundStyle(Color(oklch: "oklch(0.452 0.3132 264.05 / 0.16)"))
      RuleMark(y: .value("50", 50)).foregroundStyle(Color(oklch: "oklch(0.7252 0 0 / 0.22)")).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
      RuleMark(y: .value("Extreme high", result.extremeHigh)).foregroundStyle(Color(oklch: "oklch(0.628 0.2577 29.23 / 0.18)")).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      RuleMark(y: .value("Extreme low", result.extremeLow)).foregroundStyle(Color(oklch: "oklch(0.452 0.3132 264.05 / 0.18)")).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      IndicatorLine(id: "BBWP", points: colored, width: 2)
      IndicatorLine(id: "MA", points: ma.visible(in: window), color: .white.opacity(0.55), width: 2, dash: [4, 4])
      ScrubRule(date: scrubDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport,
                   yDomain: IndicatorPlotScale.domain(points: [], visible: window.epochs, anchors: [0, 100], margin: 0.15), height: height)
    .chartLegend(.hidden)
    .overlay(alignment: .topLeading) { IndicatorReadout(date: scrubDate, series: [("BBWP", line), ("MA", ma)]) }
    .accessibilityIdentifier("indicator-bbwp")
  }
}

#if DEBUG
#Preview("Volatility — web parity") {
  PreviewValue(Date?.none) { date in
    BBWPChart(result: PreviewFixtures.indicators.bbwp, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
