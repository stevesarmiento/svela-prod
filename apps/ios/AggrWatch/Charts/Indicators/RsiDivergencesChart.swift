import AggrCore
import Charts
import SwiftUI

/// Caretaker's web palette, zones, alert guides, directional pivots and four divergence styles.
struct RsiDivergencesChart: View {
  let result: RsiDivergences.Result
  let windowDays: Int
  @Binding var selectedDate: Date?
  var height: CGFloat = 250
  var showLabels = true
  @State private var viewport = IndicatorViewport()
  private let cyan = "oklch(0.7891 0.1546 211.53)"
  private let fuchsia = "oklch(0.6669 0.2591 322.15)"
  private let yellow = "oklch(0.8601 0.1731 91.84)"

  var body: some View {
    let rsi = result.rsiSeries.chartPoints
    let signal = result.signalSeries.chartPoints
    let window = viewport.window(points: rsi, days: windowDays)
    let domain = IndicatorPlotScale.domain(points: result.rsiSeries + result.signalSeries, visible: window.epochs, anchors: [result.alertLow, result.alertHigh], margin: 0.12)
    let scrubDate = rsi.nearest(to: selectedDate)?.date
    Chart {
      zones(window: window)
      guide(80, color: cyan, opacity: 0.45, dash: [4, 4])
      guide(62, color: cyan, opacity: 0.45, dash: [1, 3])
      guide(50, color: "oklch(0.7118 0.0129 286.07)", opacity: 0.22, dash: [])
      guide(38, color: fuchsia, opacity: 0.45, dash: [1, 3])
      guide(20, color: fuchsia, opacity: 0.45, dash: [4, 4])
      // Alert guides remain visible; only their background highlight is conditional.
      guide(result.alertHigh, color: yellow, opacity: 0.55, dash: [1, 3])
      guide(result.alertLow, color: yellow, opacity: 0.55, dash: [1, 3])
      IndicatorLine(id: "RSI", points: rsi.visible(in: window), color: Color(oklch: cyan).opacity(0.95), width: 2)
      IndicatorLine(id: "Signal", points: signal.visible(in: window), color: .white.opacity(0.9), width: 2)
      divergences(window: window)
      ForEach(Array(result.pivots.suffix(200).enumerated()), id: \.offset) { _, pivot in
        if window.epochs.contains(pivot.time) {
          PointMark(x: .value("Time", Date(timeIntervalSince1970: TimeInterval(pivot.time))), y: .value("Pivot", pivot.value))
            .symbolSize(0)
            .annotation(position: pivot.isHigh ? .top : .bottom, spacing: 2) {
              Image(systemName: pivot.isHigh ? "arrow.down" : "arrow.up")
                .font(.system(size: 8, weight: .bold)).foregroundStyle(.white.opacity(0.85))
            }
        }
      }
      ScrubRule(date: scrubDate)
    }
    .chartXSelection(value: $selectedDate)
    .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height)
    .chartLegend(.hidden)
    .overlay(alignment: .topLeading) { IndicatorReadout(date: scrubDate, series: [("RSI", rsi), ("Signal", signal)]) }
    .accessibilityIdentifier("indicator-caretaker-rsi")
  }

  @ChartContentBuilder private func guide(_ value: Double, color: String, opacity: Double, dash: [CGFloat]) -> some ChartContent {
    RuleMark(y: .value("Level", value)).foregroundStyle(Color(oklch: color).opacity(opacity)).lineStyle(StrokeStyle(lineWidth: 1, dash: dash))
  }

  @ChartContentBuilder private func zone(_ lower: Double, _ upper: Double, color: String, opacity: Double, window: IndicatorWindow) -> some ChartContent {
    RectangleMark(xStart: .value("Start", window.domain.lowerBound), xEnd: .value("End", window.domain.upperBound), yStart: .value("Lower", lower), yEnd: .value("Upper", upper))
      .foregroundStyle(Color(oklch: color).opacity(opacity))
  }

  @ChartContentBuilder private func zones(window: IndicatorWindow) -> some ChartContent {
    zone(80, 100, color: cyan, opacity: 0.14, window: window)
    zone(62, 80, color: cyan, opacity: 0.08, window: window)
    zone(20, 38, color: fuchsia, opacity: 0.08, window: window)
    zone(0, 20, color: fuchsia, opacity: 0.14, window: window)
    if result.alertHighOn { zone(result.alertHigh, 100, color: yellow, opacity: 0.07, window: window) }
    if result.alertLowOn { zone(0, result.alertLow, color: yellow, opacity: 0.07, window: window) }
  }

  @ChartContentBuilder private func divergences(window: IndicatorWindow) -> some ChartContent {
    ForEach(Array(result.divergences.suffix(200).enumerated()), id: \.offset) { index, divergence in
      if divergence.endTime >= window.epochs.lowerBound && divergence.startTime <= window.epochs.upperBound {
        let color = divergenceColor(divergence.type)
        let hidden = divergence.type == .h_bullish || divergence.type == .h_bearish
        IndicatorLine(id: "divergence-\(index)", points: [IPt(time: divergence.startTime, value: divergence.rsiStart), IPt(time: divergence.endTime, value: divergence.rsiEnd)], color: color, width: 2, dash: hidden ? [4, 4] : [])
        if showLabels {
          PointMark(x: .value("Time", Date(timeIntervalSince1970: TimeInterval(divergence.endTime))), y: .value("End", divergence.rsiEnd))
            .symbolSize(0)
            .annotation(position: divergence.type.isBullish ? .bottom : .top, spacing: 4) {
              Text(label(divergence.type)).font(.system(size: 9, weight: .semibold, design: .rounded))
                .foregroundStyle(.white).padding(.horizontal, 5).padding(.vertical, 2)
                .background(color, in: .rect(cornerRadius: 4))
            }
        }
      }
    }
  }

  private func divergenceColor(_ type: DivergenceType) -> Color {
    let color = switch type {
    case .bullish: "oklch(0.7227 0.192 149.58 / 0.95)"
    case .bearish: "oklch(0.6368 0.2078 25.33 / 0.95)"
    case .h_bullish: "oklch(0.7137 0.1434 254.62 / 0.95)"
    case .h_bearish: "oklch(0.7049 0.1867 47.6 / 0.95)"
    }
    return Color(oklch: color)
  }

  private func label(_ type: DivergenceType) -> String {
    switch type { case .bullish: "Bull"; case .bearish: "Bear"; case .h_bullish: "H_Bull"; case .h_bearish: "H_Bear" }
  }
}

#if DEBUG
#Preview("Caretaker RSI — web parity") {
  PreviewValue(Date?.none) { date in
    RsiDivergencesChart(result: PreviewFixtures.indicators.rsiDivergences, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
