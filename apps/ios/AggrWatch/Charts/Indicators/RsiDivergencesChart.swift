import AggrCore
import Charts
import SwiftUI

nonisolated struct RsiChartData: Sendable, Equatable {
  nonisolated struct PreparedDivergence: Identifiable, Hashable, Sendable {
    let id: Int
    let startTime: Int, endTime: Int
    let line: [IPt]
    let endDate: Date
    let rsiEnd: Double
    let color: Color
    let hidden: Bool
    let isBullish: Bool
    let label: String
  }

  let id = UUID()
  let rsi: [IPt], signal: [IPt]
  let pivots: [RsiDivergences.Pivot]
  let divergences: [PreparedDivergence]
  let alertHigh: Double, alertLow: Double, alertHighOn: Bool, alertLowOn: Bool
  let domainSeries: [[IPt]]
  let readout: [(String, [IPt])]

  init(_ result: RsiDivergences.Result) {
    rsi = result.rsiSeries.chartPoints; signal = result.signalSeries.chartPoints
    pivots = Array(result.pivots.suffix(200))
    divergences = result.divergences.suffix(200).enumerated().map { index, d in
      PreparedDivergence(id: index, startTime: d.startTime, endTime: d.endTime,
                         line: [IPt(time: d.startTime, value: d.rsiStart), IPt(time: d.endTime, value: d.rsiEnd)],
                         endDate: Date(timeIntervalSince1970: TimeInterval(d.endTime)), rsiEnd: d.rsiEnd,
                         color: Self.color(d.type), hidden: d.type == .h_bullish || d.type == .h_bearish,
                         isBullish: d.type.isBullish, label: Self.label(d.type))
    }
    alertHigh = result.alertHigh; alertLow = result.alertLow; alertHighOn = result.alertHighOn; alertLowOn = result.alertLowOn
    domainSeries = [rsi, signal]
    readout = [("RSI", rsi), ("Signal", signal)]
  }

  private static let bullish = Color(oklch: "oklch(0.7227 0.192 149.58 / 0.95)")
  private static let bearish = Color(oklch: "oklch(0.6368 0.2078 25.33 / 0.95)")
  private static let hiddenBullish = Color(oklch: "oklch(0.7137 0.1434 254.62 / 0.95)")
  private static let hiddenBearish = Color(oklch: "oklch(0.7049 0.1867 47.6 / 0.95)")

  private static func color(_ type: DivergenceType) -> Color {
    switch type { case .bullish: bullish; case .bearish: bearish; case .h_bullish: hiddenBullish; case .h_bearish: hiddenBearish }
  }
  private static func label(_ type: DivergenceType) -> String {
    switch type { case .bullish: "Bull"; case .bearish: "Bear"; case .h_bullish: "H_Bull"; case .h_bearish: "H_Bear" }
  }

  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}

/// Caretaker's web palette, zones, alert guides, directional pivots and four divergence styles.
struct RsiDivergencesChart: View {
  let data: RsiChartData
  let windowDays: Int
  var height: CGFloat = 250
  var showLabels = true
  private let sharedScrub: IndicatorScrubStore?
  private let external: Binding<Date?>?
  @State private var ownScrub = IndicatorScrubStore()
  @State private var selection: Date?
  @State private var viewport = IndicatorViewport()

  init(data: RsiChartData, windowDays: Int, scrub: IndicatorScrubStore, height: CGFloat = 250, showLabels: Bool = true) {
    self.data = data; self.windowDays = windowDays; self.height = height; self.showLabels = showLabels
    sharedScrub = scrub; external = nil
  }

  init(result: RsiDivergences.Result, windowDays: Int, selectedDate: Binding<Date?>, height: CGFloat = 250, showLabels: Bool = true) {
    data = RsiChartData(result); self.windowDays = windowDays; self.height = height; self.showLabels = showLabels
    sharedScrub = nil; external = selectedDate
  }

  private var scrub: IndicatorScrubStore { sharedScrub ?? ownScrub }

  var body: some View {
    let window = viewport.window(points: data.rsi, days: windowDays)
    let domain = IndicatorYDomain.compute(series: data.domainSeries, visible: window.epochs, anchors: [data.alertLow, data.alertHigh], margin: 0.12)
    RsiDivergencesPlot(data: data, window: window, showLabels: showLabels)
      .equatable()
      .indicatorScrub(selection: $selection, scrub: scrub, anchor: data.rsi, external: external)
      .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height)
      .chartLegend(.hidden)
      .overlay(alignment: .topLeading) { IndicatorReadout(scrub: scrub, series: data.readout) }
      .accessibilityIdentifier("indicator-caretaker-rsi")
  }
}

private struct RsiDivergencesPlot: View, Equatable {
  let data: RsiChartData
  let window: IndicatorWindow
  let showLabels: Bool

  private static let cyan = Color(oklch: "oklch(0.7891 0.1546 211.53)")
  private static let fuchsia = Color(oklch: "oklch(0.6669 0.2591 322.15)")
  private static let yellow = Color(oklch: "oklch(0.8601 0.1731 91.84)")
  private static let neutral = Color(oklch: "oklch(0.7118 0.0129 286.07)")

  var body: some View {
    let epochs = window.epochs
    Chart {
      zones
      guide(80, color: Self.cyan, opacity: 0.45, dash: [4, 4])
      guide(62, color: Self.cyan, opacity: 0.45, dash: [1, 3])
      guide(50, color: Self.neutral, opacity: 0.22, dash: [])
      guide(38, color: Self.fuchsia, opacity: 0.45, dash: [1, 3])
      guide(20, color: Self.fuchsia, opacity: 0.45, dash: [4, 4])
      // Alert guides remain visible; only their background highlight is conditional.
      guide(data.alertHigh, color: Self.yellow, opacity: 0.55, dash: [1, 3])
      guide(data.alertLow, color: Self.yellow, opacity: 0.55, dash: [1, 3])
      IndicatorLine(id: "RSI", points: data.rsi.visible(in: window), color: Self.cyan.opacity(0.95), width: 2)
      IndicatorLine(id: "Signal", points: data.signal.visible(in: window), color: .white.opacity(0.9), width: 2)
      ForEach(data.divergences) { divergence in
        if divergence.endTime >= epochs.lowerBound && divergence.startTime <= epochs.upperBound {
          IndicatorLine(id: "divergence-\(divergence.id)", points: divergence.line, color: divergence.color, width: 2, dash: divergence.hidden ? [4, 4] : [])
          if showLabels {
            PointMark(x: .value("Time", divergence.endDate), y: .value("End", divergence.rsiEnd))
              .symbolSize(0)
              .annotation(position: divergence.isBullish ? .bottom : .top, spacing: 4) {
                Text(divergence.label).font(.system(size: 9, weight: .semibold, design: .rounded))
                  .foregroundStyle(.white).padding(.horizontal, 5).padding(.vertical, 2)
                  .background(divergence.color, in: .rect(cornerRadius: 4))
              }
          }
        }
      }
      ForEach(Array(data.pivots.enumerated()), id: \.offset) { _, pivot in
        if epochs.contains(pivot.time) {
          PointMark(x: .value("Time", Date(timeIntervalSince1970: TimeInterval(pivot.time))), y: .value("Pivot", pivot.value))
            .symbolSize(0)
            .annotation(position: pivot.isHigh ? .top : .bottom, spacing: 2) {
              Image(systemName: pivot.isHigh ? "arrow.down" : "arrow.up")
                .font(.system(size: 8, weight: .bold)).foregroundStyle(.white.opacity(0.85))
            }
        }
      }
    }
  }

  @ChartContentBuilder private func guide(_ value: Double, color: Color, opacity: Double, dash: [CGFloat]) -> some ChartContent {
    RuleMark(y: .value("Level", value)).foregroundStyle(color.opacity(opacity)).lineStyle(StrokeStyle(lineWidth: 1, dash: dash))
  }

  @ChartContentBuilder private func zone(_ lower: Double, _ upper: Double, color: Color, opacity: Double) -> some ChartContent {
    RectangleMark(xStart: .value("Start", window.domain.lowerBound), xEnd: .value("End", window.domain.upperBound), yStart: .value("Lower", lower), yEnd: .value("Upper", upper))
      .foregroundStyle(color.opacity(opacity))
  }

  @ChartContentBuilder private var zones: some ChartContent {
    zone(80, 100, color: Self.cyan, opacity: 0.14)
    zone(62, 80, color: Self.cyan, opacity: 0.08)
    zone(20, 38, color: Self.fuchsia, opacity: 0.08)
    zone(0, 20, color: Self.fuchsia, opacity: 0.14)
    if data.alertHighOn { zone(data.alertHigh, 100, color: Self.yellow, opacity: 0.07) }
    if data.alertLowOn { zone(0, data.alertLow, color: Self.yellow, opacity: 0.07) }
  }

  static func == (a: Self, b: Self) -> Bool { a.data == b.data && a.window == b.window && a.showLabels == b.showLabels }
}

#if DEBUG
#Preview("Caretaker RSI — web parity") {
  PreviewValue(Date?.none) { date in
    RsiDivergencesChart(result: PreviewFixtures.indicators.rsiDivergences, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
