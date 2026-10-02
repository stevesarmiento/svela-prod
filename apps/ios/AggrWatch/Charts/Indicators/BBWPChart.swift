import AggrCore
import Charts
import SwiftUI

nonisolated struct BBWPChartData: Sendable, Equatable {
  private static let palette = (0...100).map { IndicatorPlotScale.volatilityColor(Double($0)) }

  let id = UUID()
  /// Per-value OKLCH spectrum already assigned, so panning never re-colors the line.
  let line: [IPt]
  let ma: [IPt]
  let extremeHigh: Double
  let extremeLow: Double
  let readout: [(String, [IPt])]

  init(_ result: BBWP.Result) {
    let plain = result.bbwp.chartPoints
    line = plain.map { IPt(time: $0.id, value: $0.value, color: Self.palette[min(100, max(0, Int($0.value.rounded())))]) }
    ma = result.ma.chartPoints
    extremeHigh = result.extremeHigh; extremeLow = result.extremeLow
    readout = [("BBWP", plain), ("MA", ma)]
  }

  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}

/// Web's per-value OKLCH spectrum, 0/50/100 scale guides, 2/98 extremes and dashed MA.
struct BBWPChart: View {
  let data: BBWPChartData
  let windowDays: Int
  var height: CGFloat = 250
  private let sharedScrub: IndicatorScrubStore?
  private let external: Binding<Date?>?
  @State private var ownScrub = IndicatorScrubStore()
  @State private var selection: Date?
  @State private var viewport = IndicatorViewport()

  init(data: BBWPChartData, windowDays: Int, scrub: IndicatorScrubStore, height: CGFloat = 250) {
    self.data = data; self.windowDays = windowDays; self.height = height
    sharedScrub = scrub; external = nil
  }

  init(result: BBWP.Result, windowDays: Int, selectedDate: Binding<Date?>, height: CGFloat = 250) {
    data = BBWPChartData(result); self.windowDays = windowDays; self.height = height
    sharedScrub = nil; external = selectedDate
  }

  private var scrub: IndicatorScrubStore { sharedScrub ?? ownScrub }

  var body: some View {
    let window = viewport.window(points: data.line, days: windowDays)
    BBWPPlot(data: data, window: window)
      .equatable()
      .indicatorScrub(selection: $selection, scrub: scrub, anchor: data.line, external: external)
      .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport,
                     yDomain: IndicatorPlotScale.domain(points: [], visible: window.epochs, anchors: [0, 100], margin: 0.15), height: height)
      .chartLegend(.hidden)
      .overlay(alignment: .topLeading) { IndicatorReadout(scrub: scrub, series: data.readout) }
      .accessibilityIdentifier("indicator-bbwp")
  }
}

private struct BBWPPlot: View, Equatable {
  let data: BBWPChartData
  let window: IndicatorWindow

  private static let top = Color(oklch: "oklch(0.628 0.2577 29.23 / 0.16)")
  private static let bottom = Color(oklch: "oklch(0.452 0.3132 264.05 / 0.16)")
  private static let middle = Color(oklch: "oklch(0.7252 0 0 / 0.22)")
  private static let extremeHigh = Color(oklch: "oklch(0.628 0.2577 29.23 / 0.18)")
  private static let extremeLow = Color(oklch: "oklch(0.452 0.3132 264.05 / 0.18)")

  var body: some View {
    Chart {
      RuleMark(y: .value("100", 100)).foregroundStyle(Self.top)
      RuleMark(y: .value("0", 0)).foregroundStyle(Self.bottom)
      RuleMark(y: .value("50", 50)).foregroundStyle(Self.middle).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
      RuleMark(y: .value("Extreme high", data.extremeHigh)).foregroundStyle(Self.extremeHigh).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      RuleMark(y: .value("Extreme low", data.extremeLow)).foregroundStyle(Self.extremeLow).lineStyle(StrokeStyle(lineWidth: 1, dash: [1, 3]))
      IndicatorLine(id: "BBWP", points: data.line.visible(in: window), width: 2)
      IndicatorLine(id: "MA", points: data.ma.visible(in: window), color: .white.opacity(0.55), width: 2, dash: [4, 4])
    }
  }

  static func == (a: Self, b: Self) -> Bool { a.data == b.data && a.window == b.window }
}

#if DEBUG
#Preview("Volatility — web parity") {
  PreviewValue(Date?.none) { date in
    BBWPChart(result: PreviewFixtures.indicators.bbwp, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
