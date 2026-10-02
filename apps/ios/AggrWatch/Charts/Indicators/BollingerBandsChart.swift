import AggrCore
import Charts
import SwiftUI

nonisolated struct BollingerChartData: Sendable, Equatable {
  let id = UUID()
  let indicator: [IPt], upper: [IPt], lower: [IPt], basis: [IPt]
  let overbought: [IPt], oversold: [IPt]
  let isMfi: Bool
  let domainSeries: [[IPt]]
  let readout: [(String, [IPt])]

  init(_ result: BollingerBands.Result) {
    indicator = result.indicator.chartPoints; upper = result.upper.chartPoints
    lower = result.lower.chartPoints; basis = result.basis.chartPoints
    overbought = result.overboughtBreaches.chartPoints; oversold = result.oversoldBreaches.chartPoints
    isMfi = result.isMfi
    domainSeries = [indicator, upper, lower]
    readout = [(result.isMfi ? "MFI" : "RSI", indicator), ("Upper", upper), ("Basis", basis), ("Lower", lower)]
  }

  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}

/// Web parity: muted dotted bands, dashed basis, RSI and prominent breach dots.
struct BollingerBandsChart: View {
  let data: BollingerChartData
  let windowDays: Int
  var height: CGFloat = 250
  private let sharedScrub: IndicatorScrubStore?
  private let external: Binding<Date?>?
  @State private var ownScrub = IndicatorScrubStore()
  @State private var selection: Date?
  @State private var viewport = IndicatorViewport()

  init(data: BollingerChartData, windowDays: Int, scrub: IndicatorScrubStore, height: CGFloat = 250) {
    self.data = data; self.windowDays = windowDays; self.height = height
    sharedScrub = scrub; external = nil
  }

  init(result: BollingerBands.Result, windowDays: Int, selectedDate: Binding<Date?>, height: CGFloat = 250) {
    data = BollingerChartData(result); self.windowDays = windowDays; self.height = height
    sharedScrub = nil; external = selectedDate
  }

  private var scrub: IndicatorScrubStore { sharedScrub ?? ownScrub }

  var body: some View {
    let window = viewport.window(points: data.indicator, days: windowDays)
    let domain = IndicatorYDomain.compute(series: data.domainSeries, visible: window.epochs)
    BollingerPlot(data: data, window: window)
      .equatable()
      .indicatorScrub(selection: $selection, scrub: scrub, anchor: data.indicator, external: external)
      .indicatorPane(window: window, windowDays: windowDays, viewport: $viewport, yDomain: domain, height: height)
      .chartLegend(.hidden)
      .overlay(alignment: .topLeading) { IndicatorReadout(scrub: scrub, series: data.readout) }
      .accessibilityIdentifier("indicator-bollinger")
  }
}

private struct BollingerPlot: View, Equatable {
  let data: BollingerChartData
  let window: IndicatorWindow

  private static let band = Color(oklch: "oklch(0.7118 0.0129 286.07 / 0.46)")
  private static let basis = Color(oklch: "oklch(0.7118 0.0129 286.07 / 0.75)")
  private static let rsi = Color(oklch: BollingerBands.Colors.rsi)
  private static let mfi = Color(oklch: BollingerBands.Colors.mfi)
  private static let overbought = Color(oklch: "oklch(0.645 0.2154 16.44 / 0.95)")
  private static let oversold = Color(oklch: "oklch(0.6959 0.1491 162.48 / 0.95)")

  var body: some View {
    Chart {
      IndicatorLine(id: "upper", points: data.upper.visible(in: window), color: Self.band, dash: [1, 3])
      IndicatorLine(id: "lower", points: data.lower.visible(in: window), color: Self.band, dash: [1, 3])
      IndicatorLine(id: "basis", points: data.basis.visible(in: window), color: Self.basis, dash: [4, 4])
      IndicatorLine(id: "RSI", points: data.indicator.visible(in: window), color: data.isMfi ? Self.mfi : Self.rsi, width: 2)
      IndicatorDots(points: data.overbought.visible(in: window), color: Self.overbought, diameter: 8)
      IndicatorDots(points: data.oversold.visible(in: window), color: Self.oversold, diameter: 8)
    }
  }

  static func == (a: Self, b: Self) -> Bool { a.data == b.data && a.window == b.window }
}

#if DEBUG
#Preview("Bollinger — web parity") {
  PreviewValue(Date?.none) { date in
    BollingerBandsChart(result: PreviewFixtures.indicators.bollinger, windowDays: 14, selectedDate: date).padding().preferredColorScheme(.dark)
  }
}
#endif
