import AggrCore
import AggrLiveline
import SwiftUI
import UIKit

/// Shared native comparison for watchlist returns and individual token returns.
struct MultiLineComparisonChart: View {
  struct Series: Identifiable, Hashable {
    let id: String
    let label: String
    let color: String
    let points: [TimePoint]
    var latest: Double? { points.last?.value }
  }

  let series: [Series]
  var selectedIDs: Set<String> = []
  var datasetID = "comparison"
  var scale: TimeScale = .d1
  var isActive = true
  var accessibilityID = "comparison-chart"
  @State private var selection: LivelineSelection?
  @State private var isVisible = true
  @Environment(\.scenePhase) private var scenePhase

  static func input(series: [Series], selectedIDs: Set<String>, datasetID: String, scale: TimeScale) -> LivelineInput {
    let focused = selectedIDs.intersection(series.map(\.id))
    let lines = series.map { s in
      LivelineSeries(id: s.id,
        points: LivelineMath.clean(s.points.map { .init(time: Double($0.epochSeconds), value: $0.value) }),
        color: Color(oklch: s.color).livelineColor, width: 1.4,
        opacity: focused.isEmpty || focused.contains(s.id) ? 1 : 0.18)
    }
    let times = lines.flatMap { $0.points.map(\.time) }
    let start = times.min() ?? 0, end = times.max() ?? 1
    let primary = lines.first { $0.visible && $0.points.count >= 2 }
    return .init(id: "\(datasetID)|\(scale.rawValue)", series: lines,
                 primaryID: primary?.id ?? lines.first?.id ?? "none",
                 viewport: .historical(start...max(start + 1, end)), state: primary == nil ? .empty : .ready)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      NativeComparisonPlot(series: series, selectedIDs: selectedIDs, datasetID: datasetID,
                           scale: scale, isActive: isActive && isVisible && scenePhase == .active,
                           accessibilityID: accessibilityID, onSelection: { selection = $0 })
        .equatable()
        .overlay(alignment: .top) {
          if let selection {
            ComparisonScrubTooltip(selection: selection, series: series, selectedIDs: selectedIDs)
          }
        }
    }
    .onScrollVisibilityChange(threshold: 0.01) { isVisible = $0 }
    .onChange(of: scale) { _, _ in selection = nil }
    .onChange(of: selectedIDs) { _, _ in selection = nil }
  }
}

/// The token page's rounded material tooltip, with a colored return per series.
/// It follows the scrubber without reserving permanent space beside the plot.
private struct ComparisonScrubTooltip: View {
  let selection: LivelineSelection
  let series: [MultiLineComparisonChart.Series]
  let selectedIDs: Set<String>
  @ScaledMetric(relativeTo: .caption) private var preferredWidth = 250.0

  var body: some View {
    GeometryReader { geometry in
      let width = min(preferredWidth, geometry.size.width)
      let start = series.compactMap { $0.points.first?.epochSeconds }.min() ?? 0
      let end = series.compactMap { $0.points.last?.epochSeconds }.max() ?? 1
      let fraction = min(1, max(0, (selection.time - Double(start)) / max(1, Double(end - start))))
      let x = 8 + fraction * max(0, geometry.size.width - 20)
      let focused = selectedIDs.intersection(series.map(\.id))
      let ordered = series.filter { (focused.isEmpty || focused.contains($0.id)) && selection.values[$0.id]?.isFinite == true }
      VStack(alignment: .leading, spacing: 6) {
        Text(Date(timeIntervalSince1970: selection.time), format: .dateTime.month(.abbreviated).day().year().hour().minute())
          .foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
          .accessibilityIdentifier("comparison-scrub-time")
        ForEach(ordered.prefix(5)) { item in
          HStack(spacing: 6) {
            Circle().fill(Color(oklch: item.color)).frame(width: 6, height: 6)
            Text(item.label).lineLimit(1)
            Spacer(minLength: 8)
            if let value = selection.values[item.id] {
              Text(UsdFormat.signedPercent(value)).fixedSize()
            }
          }
        }
        if ordered.count > 5 {
          Text("+\(ordered.count - 5) more · select rows to focus").foregroundStyle(.secondary)
        }
      }
      .font(.system(.caption, design: .rounded, weight: .medium).monospacedDigit())
      .padding(.horizontal, 12).padding(.vertical, 7)
      .frame(width: width)
      .background(.regularMaterial, in: .rect(cornerRadius: 16))
      .offset(x: min(max(0, geometry.size.width - width), max(0, x - width / 2)), y: 4)
      .accessibilityIdentifier("comparison-chart-inspection")
    }
    .allowsHitTesting(false)
  }
}

/// Preparation is keyed by data, not selection or visibility. This is an
/// unobserved memo: updating it never schedules another SwiftUI render.
@MainActor final class ComparisonChartPreparation {
  private var series: [MultiLineComparisonChart.Series] = []
  private var datasetID: String?
  private var scale: TimeScale?
  private var prepared: LivelineInput?
  #if DEBUG
  private(set) var preparationCount = 0
  #endif

  func input(series: [MultiLineComparisonChart.Series], selectedIDs: Set<String>, datasetID: String, scale: TimeScale) -> LivelineInput {
    if prepared == nil || self.series != series || self.datasetID != datasetID || self.scale != scale {
      prepared = MultiLineComparisonChart.input(series: series, selectedIDs: [], datasetID: datasetID, scale: scale)
      self.series = series; self.datasetID = datasetID; self.scale = scale
      #if DEBUG
      preparationCount += 1
      #endif
    }
    var input = prepared!
    let focused = selectedIDs.intersection(input.series.map(\.id))
    for index in input.series.indices {
      input.series[index].opacity = focused.isEmpty || focused.contains(input.series[index].id) ? 1 : 0.18
    }
    return input
  }
}

/// Inspection updates only the tooltip, without rebuilding every series.
private struct NativeComparisonPlot: View, Equatable {
  let series: [MultiLineComparisonChart.Series]
  let selectedIDs: Set<String>
  let datasetID: String
  let scale: TimeScale
  let isActive: Bool
  let accessibilityID: String
  let onSelection: (LivelineSelection?) -> Void
  @State private var preparation = ComparisonChartPreparation()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let input = preparation.input(series: series, selectedIDs: selectedIDs, datasetID: datasetID, scale: scale)
    var config = LivelineConfiguration()
    let _ = {
      config.fill = false; config.badge = false; config.dot = false
      config.pulse = false; config.extrema = false; config.referenceValue = 0
      config.reduceMotion = reduceMotion
      config.seriesLabels = Dictionary(uniqueKeysWithValues: series.map { ($0.id, $0.label) })
    }()
    ZStack {
      LivelineView(input: input, configuration: config, isActive: isActive && input.state == .ready,
        tracksScrollVisibility: false,
        formatValue: { UsdFormat.signedPercent($0, fractionDigits: 1) },
        formatTime: { time in
          let date = Date(timeIntervalSince1970: time)
          return date.formatted(scale == .d1 ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
        }, onSelection: onSelection)
        .opacity(input.state == .ready ? 1 : 0)
        .accessibilityIdentifier(accessibilityID)
        .accessibilityLabel("Comparison performance chart")
      if input.state == .empty {
        Text("No chart data yet")
          .font(.footnote).foregroundStyle(.secondary).allowsHitTesting(false)
      }
    }
  }

  static func == (a: Self, b: Self) -> Bool {
    a.series == b.series && a.selectedIDs == b.selectedIDs
      && a.datasetID == b.datasetID && a.scale == b.scale && a.isActive == b.isActive
      && a.accessibilityID == b.accessibilityID
  }
}

extension Color {
  var livelineColor: LivelineColor {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 1
    UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a)
    return .init(r, g, b, a)
  }
}

/// Compact, noninteractive Liveline renderer shared by cards and accordion rows.
struct AggrSparkline: View, Equatable {
  let points: [TimePoint]
  var isActive = true
  var color: Color = .white.opacity(0.65)
  var lineWidth: Double = 1.4
  var fadeLeading = true
  @State private var isVisible = true
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    let series = LivelineMath.clean(points.map { .init(time: Double($0.epochSeconds), value: $0.value) })
    let start = series.first?.time ?? 0
    let end = max(start + 1, series.last?.time ?? start + 1)
    let input = LivelineInput(id: "sparkline", series: [
      .init(id: "price", points: series, color: color.livelineColor, width: lineWidth)
    ], viewport: .historical(start...end))
    var config = LivelineConfiguration.sparkline
    let _ = { config.reduceMotion = reduceMotion }()
    LivelineView(input: input, configuration: config, isActive: isActive && isVisible && scenePhase == .active,
                 formatValue: { UsdFormat.signedPercent($0) }, formatTime: { _ in "" })
      .mask {
        if fadeLeading {
          LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.12), .init(color: .black, location: 1)],
                         startPoint: .leading, endPoint: .trailing)
        } else { Color.black }
      }
      .onScrollVisibilityChange(threshold: 0.01) { isVisible = $0 }
      .allowsHitTesting(false).accessibilityHidden(true)
  }

  static func == (a: Self, b: Self) -> Bool {
    a.points == b.points && a.isActive == b.isActive && a.color == b.color
      && a.lineWidth == b.lineWidth && a.fadeLeading == b.fadeLeading
  }
}

#if DEBUG
#Preview("Liveline comparison · select and scrub") {
  PreviewValue(Set<String>()) { selected in
    MultiLineComparisonChart(series: [
      .init(id: "btc", label: "BTC", color: ChartColors.pastel[0], points: PreviewFixtures.returns),
      .init(id: "eth", label: "ETH", color: ChartColors.pastel[1], points: PreviewFixtures.returns.map { .init(epochSeconds: $0.epochSeconds, value: $0.value * 0.6 - 2) })
    ], selectedIDs: selected.wrappedValue).frame(height: 300).padding().preferredColorScheme(.dark)
  }
}
#Preview("Liveline comparison · many watchlists") {
  let series: [MultiLineComparisonChart.Series] = (0..<19).map { index in
    let points = PreviewFixtures.returns.map { point in
      TimePoint(epochSeconds: point.epochSeconds, value: point.value * Double(index + 1) / 10 - Double(index))
    }
    return MultiLineComparisonChart.Series(id: "group-\(index)", label: "Watchlist \(index + 1)",
      color: ChartColors.pastel[index % ChartColors.pastel.count], points: points)
  }
  PreviewValue(Set<String>()) { selected in
    MultiLineComparisonChart(series: series, selectedIDs: selected.wrappedValue).frame(height: 300).padding().preferredColorScheme(.dark)
  }
}
#endif
