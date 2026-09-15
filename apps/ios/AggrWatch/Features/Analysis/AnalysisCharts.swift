import AggrCore
import Charts
import SwiftUI

/// Borderless seven-day chart: price, volume and dotted EHMA Hull, like the web analysis sidebar.
struct AnalysisPriceChart: View {
  struct Model {
    let prices: [TimePoint]
    let volume: [TimePoint]
    let hull: [TimePoint]
    init(data: ParsedChartData) {
      let cleanPrices = AnalysisChartSeries.clean(data.line)
      let start = (cleanPrices.last?.epochSeconds ?? 0) - 7 * 86_400
      prices = cleanPrices.filter { $0.epochSeconds >= start }
      volume = AnalysisChartSeries.clean(data.volume, allowsZero: true).filter { $0.epochSeconds >= start }
      hull = AnalysisChartSeries.clean(HullSuite.compute(data.ohlc, config: .tokenPage).mhull).filter { $0.epochSeconds >= start }
    }
  }
  let model: Model
  @State private var selectedDate: Date?
  private var prices: [TimePoint] { model.prices }
  private var volume: [TimePoint] { model.volume }
  private var hull: [TimePoint] { model.hull }

  private var selected: TimePoint? {
    guard let selectedDate else { return prices.last }
    return prices.min { abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate)) }
  }
  private var change: Double? {
    guard let value = selected?.value, let base = prices.first?.value, base > 0 else { return nil }
    return (value / base - 1) * 100
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text(selectedDate == nil ? "Price · 7 days" : (selected?.date ?? .now).formatted(date: .abbreviated, time: .shortened))
          .font(.caption).foregroundStyle(.secondary)
        Spacer(minLength: 8)
        if let value = selected?.value { Text(UsdFormat.price(value)).font(.subheadline.monospacedDigit().weight(.semibold)) }
        PercentBadge(pct: change, compact: true)
      }
      if prices.count >= 2 { plot }
      else { Text("No price history available").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 160) }
      HStack(spacing: 16) {
        Label("Hull EHMA", systemImage: "line.diagonal").foregroundStyle(.blue)
        Label("Volume", systemImage: "chart.bar.fill").foregroundStyle(.secondary)
        Spacer()
        Text("Touch to inspect").foregroundStyle(.tertiary)
      }.font(.caption2)
    }
    .accessibilityIdentifier("analysis-price-chart")
  }

  private var plot: some View {
    let values = (prices + hull).map(\.value)
    let low = values.min() ?? 0, high = values.max() ?? 1
    let padding = max((high - low) * 0.1, abs(high) * 0.005, 0.001)
    let floor = low - padding, ceiling = high + padding
    let maxVolume = max(volume.map(\.value).max() ?? 1, 1)
    return Chart {
      ForEach(volume, id: \.epochSeconds) { point in
        BarMark(x: .value("Time", point.date), yStart: .value("Base", floor),
                yEnd: .value("Volume", floor + point.value / maxVolume * (ceiling - floor) * 0.2), width: .fixed(2))
          .foregroundStyle(Color.white.opacity(0.15))
          .accessibilityLabel("Volume").accessibilityValue(UsdFormat.largeUsd(point.value))
      }
      ForEach(prices, id: \.epochSeconds) { point in
        LineMark(x: .value("Time", point.date), y: .value("Price", point.value), series: .value("Line", "Price"))
          .foregroundStyle(AnalysisValueStyle.color((prices.last?.value ?? 0) - (prices.first?.value ?? 0))).lineStyle(.init(lineWidth: 1.8))
      }
      ForEach(hull, id: \.epochSeconds) { point in
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
    .frame(height: 180)
  }
}

struct AnalysisComparisonChart: View {
  let lines: [AnalysisChartSeries.Line]
  @State private var selectedDate: Date?

  private func point(_ line: AnalysisChartSeries.Line) -> TimePoint? {
    guard let selectedDate else { return line.points.last }
    return line.points.min { abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate)) }
  }
  private func color(_ index: Int) -> Color { Color(oklch: ChartColors.pastel[index % ChartColors.pastel.count]) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(selectedDate.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? "Relative performance · 7 days")
        .font(.caption).foregroundStyle(.secondary)
      LazyVGrid(columns: [.init(.adaptive(minimum: 135), alignment: .leading)], alignment: .leading, spacing: 8) {
        ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
          HStack(spacing: 5) {
            Circle().fill(color(index)).frame(width: 6, height: 6)
            Text(line.symbol.uppercased()).fontWeight(.semibold)
            Text(AnalysisValueStyle.percent(point(line)?.value)).foregroundStyle(AnalysisValueStyle.color(point(line)?.value))
          }.font(.caption.monospacedDigit())
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
            if selectedDate != nil, let p = point(line) {
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
        .frame(height: 180)
      } else {
        Text("Not enough overlapping history to chart these tokens.")
          .font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 120)
      }
      Text("Each token starts at 0% at the first shared time. Touch to compare values.")
        .font(.caption2).foregroundStyle(.secondary)
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
