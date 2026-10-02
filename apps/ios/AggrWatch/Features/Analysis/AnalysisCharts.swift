import AggrCore
import Charts
import SwiftUI

/// Borderless seven-day chart: price, volume and dotted EHMA Hull, like the web analysis sidebar.
struct AnalysisPriceChart: View, Equatable {
  /// Series are downsampled for a 220pt plot and the axis bounds are fixed here, so the chart body
  /// (which re-runs per selection) only draws.
  struct Model: Equatable {
    static let maxPoints = 300
    let prices: [TimePoint]
    let volume: [TimePoint]
    let hull: [TimePoint]
    let floor: Double
    let ceiling: Double
    let maxVolume: Double
    let lineColor: Color
    init(data: ParsedChartData) {
      let cleanPrices = AnalysisChartSeries.clean(data.line)
      let start = (cleanPrices.last?.epochSeconds ?? 0) - 7 * 86_400
      prices = ChartSeries.downsample(cleanPrices.filter { $0.epochSeconds >= start }, max: Self.maxPoints)
      volume = ChartSeries.downsample(AnalysisChartSeries.clean(data.volume, allowsZero: true).filter { $0.epochSeconds >= start }, max: Self.maxPoints)
      hull = ChartSeries.downsample(AnalysisChartSeries.clean(HullSuite.compute(data.ohlc, config: .tokenPage).mhull).filter { $0.epochSeconds >= start }, max: Self.maxPoints)
      let values = (prices + hull).map(\.value)
      let low = values.min() ?? 0, high = values.max() ?? 1
      let padding = max((high - low) * 0.1, abs(high) * 0.005, 0.001)
      floor = low - padding; ceiling = high + padding
      maxVolume = max(volume.map(\.value).max() ?? 1, 1)
      lineColor = AnalysisValueStyle.color((prices.last?.value ?? 0) - (prices.first?.value ?? 0))
    }
  }
  let model: Model
  @State private var selectedDate: Date?
  private var prices: [TimePoint] { model.prices }

  /// `clean` sorts by time, so the nearest point is a binary search.
  private var selected: TimePoint? {
    guard let selectedDate else { return prices.last }
    return SeriesLookup.nearest(prices, time: Int(selectedDate.timeIntervalSince1970.rounded()))
  }
  private var change: Double? {
    guard let value = selected?.value, let base = prices.first?.value, base > 0 else { return nil }
    return (value / base - 1) * 100
  }

  static func == (a: Self, b: Self) -> Bool { a.model == b.model }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // The chart owns the price readout: the page header shows only the token.
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        if let value = selected?.value {
          Text(UsdFormat.price(value)).font(.number(.title3, weight: .semibold))
            .contentTransition(.numericText(value: value))
        }
        PercentBadge(pct: change, compact: true)
        Spacer(minLength: 0)
      }
      if prices.count >= 2 { plot }
      else { Text("No price history available").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 220) }
    }
    .accessibilityIdentifier("analysis-price-chart")
  }

  private var plot: some View {
    let floor = model.floor, ceiling = model.ceiling, maxVolume = model.maxVolume
    return Chart {
      ForEach(model.volume, id: \.epochSeconds) { point in
        BarMark(x: .value("Time", point.date), yStart: .value("Base", floor),
                yEnd: .value("Volume", floor + point.value / maxVolume * (ceiling - floor) * 0.2), width: .fixed(2))
          .foregroundStyle(Color.white.opacity(0.15))
          .accessibilityLabel("Volume").accessibilityValue(UsdFormat.largeUsd(point.value))
      }
      ForEach(prices, id: \.epochSeconds) { point in
        LineMark(x: .value("Time", point.date), y: .value("Price", point.value), series: .value("Line", "Price"))
          .foregroundStyle(model.lineColor).lineStyle(.init(lineWidth: 1.8))
      }
      ForEach(model.hull, id: \.epochSeconds) { point in
        LineMark(x: .value("Time", point.date), y: .value("Hull", point.value), series: .value("Line", "Hull"))
          .foregroundStyle(Color.blue.opacity(0.75)).lineStyle(.init(lineWidth: 1, dash: [2, 3]))
      }
      if selectedDate != nil, let point = selected {
        RuleMark(x: .value("Selected", point.date)).foregroundStyle(Color.white.opacity(0.3))
        PointMark(x: .value("Time", point.date), y: .value("Price", point.value)).foregroundStyle(.white).symbolSize(24)
      }
    }
    .chartYScale(domain: floor...ceiling)
    .chartXSelection(value: $selectedDate)
    .chartXAxis(.hidden).chartYAxis(.hidden).chartLegend(.hidden)
    .chartPlotStyle { $0.clipped() }
    .frame(height: 220)
  }
}

struct AnalysisComparisonChart: View, Equatable {
  let lines: [AnalysisChartSeries.Line]
  @State private var selectedDate: Date?

  /// Lines are time-aligned and sorted, so the inspected point is a binary search per line.
  private func point(_ line: AnalysisChartSeries.Line) -> TimePoint? {
    guard let selectedDate else { return line.points.last }
    return SeriesLookup.nearest(line.points, time: Int(selectedDate.timeIntervalSince1970.rounded()))
  }
  private static let colors = ChartColors.pastel.map { Color(oklch: $0) }
  private func color(_ index: Int) -> Color { Self.colors[index % Self.colors.count] }

  static func == (a: Self, b: Self) -> Bool { a.lines == b.lines }

  var body: some View {
    // One lookup per line per body, shared by the legend and the selection marks.
    let inspected = lines.map { point($0) }
    VStack(alignment: .leading, spacing: 12) {
      LazyVGrid(columns: [.init(.adaptive(minimum: 135), alignment: .leading)], alignment: .leading, spacing: 8) {
        ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
          HStack(spacing: 5) {
            Circle().fill(color(index)).frame(width: 6, height: 6)
            Text(line.symbol.uppercased()).fontWeight(.semibold)
            Text(AnalysisValueStyle.percent(inspected[index]?.value)).foregroundStyle(AnalysisValueStyle.color(inspected[index]?.value))
          }.font(.number(.subheadline, weight: .regular))
        }
      }
      if lines.count >= 2 {
        Chart {
          RuleMark(y: .value("Baseline", 0)).foregroundStyle(Color.white.opacity(0.1)).lineStyle(.init(dash: [3, 3]))
          ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
            ForEach(line.points, id: \.epochSeconds) { p in
              LineMark(x: .value("Time", p.date), y: .value("Change %", p.value), series: .value("Token", line.id))
                .foregroundStyle(color(index)).lineStyle(.init(lineWidth: 1.8))
            }
            if selectedDate != nil, let p = inspected[index] {
              PointMark(x: .value("Time", p.date), y: .value("Change %", p.value)).foregroundStyle(color(index)).symbolSize(24)
            }
          }
          if let selectedDate {
            RuleMark(x: .value("Selected", selectedDate)).foregroundStyle(Color.white.opacity(0.3))
          }
        }
        .chartXSelection(value: $selectedDate)
        .chartYScale(domain: .automatic(includesZero: true))
        .chartXAxis(.hidden).chartYAxis(.hidden).chartLegend(.hidden)
        .chartPlotStyle { $0.clipped() }
        .frame(height: 220)
      } else {
        Text("Not enough overlapping history to chart these tokens.")
          .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
      }
    }
    .accessibilityIdentifier("analysis-comparison-chart")
  }
}

enum AnalysisValueStyle {
  static func color(_ value: Double?) -> Color {
    guard let value, value.isFinite, value != 0 else { return .secondary }
    return value > 0 ? .gainGreen : .lossRed
  }
  static func number(_ value: Double?, digits: Int = 1, suffix: String = "") -> String {
    guard let value, value.isFinite else { return "—" }
    return String(format: "%.\(digits)f", value) + suffix
  }
  static func percent(_ value: Double?, suffix: String = "%") -> String {
    guard let value, value.isFinite else { return "—" }
    return (value > 0 ? "+" : "") + number(value, suffix: suffix)
  }
}

#if DEBUG
#Preview("Analysis price, volume and Hull") {
  AnalysisPriceChart(model: .init(data: PreviewFixtures.chart)).padding().preferredColorScheme(.dark)
}
#Preview("Analysis aligned comparison") {
  AnalysisComparisonChart(lines: AnalysisChartSeries.normalized([
    .init(id: "btc", symbol: "BTC", points: PreviewFixtures.line),
    .init(id: "eth", symbol: "ETH", points: PreviewFixtures.line.enumerated().map { i, p in
      .init(epochSeconds: p.epochSeconds, value: p.value * (1 + Double(i) * 0.0002))
    })
  ])).padding().preferredColorScheme(.dark)
}
#endif
