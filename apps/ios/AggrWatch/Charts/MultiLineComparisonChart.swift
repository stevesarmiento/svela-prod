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
  @Binding var hidden: Set<String>
  var onSelect: ((String) -> Void)? = nil
  var datasetID = "comparison"
  var scale: TimeScale = .d1
  var isActive = true
  var accessibilityID = "comparison-chart"
  @State private var selection: LivelineSelection?
  @State private var pressed: String?
  @State private var isVisible = true
  @Environment(\.scenePhase) private var scenePhase

  static func input(series: [Series], hidden: Set<String>, pressed: String?, datasetID: String, scale: TimeScale) -> LivelineInput {
    let lines = series.map { s in
      LivelineSeries(id: s.id,
        points: LivelineMath.clean(s.points.map { .init(time: Double($0.epochSeconds), value: $0.value) }),
        color: Color(oklch: pressed == nil || pressed == s.id ? s.color : OklchColor.withAlpha(s.color, 0.25)).livelineColor,
        width: pressed == s.id ? 2.2 : 1.4, visible: !hidden.contains(s.id))
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
      NativeComparisonPlot(series: series, hidden: hidden, pressed: pressed, datasetID: datasetID,
                           scale: scale, isActive: isActive && isVisible && scenePhase == .active,
                           accessibilityID: accessibilityID, onSelection: { selection = $0 })
        .equatable()
        .overlay(alignment: .top) {
          if let selection {
            ComparisonScrubTooltip(selection: selection, series: series, hidden: hidden, focused: pressed)
          }
        }
      legend
    }
    .onScrollVisibilityChange(threshold: 0.01) { isVisible = $0 }
    .onChange(of: scale) { _, _ in selection = nil }
    .onChange(of: hidden) { _, _ in
      selection = nil
      if let pressed, hidden.contains(pressed) { self.pressed = nil }
    }
  }

  private var legend: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      GlassEffectContainer(spacing: 6) {
        HStack(spacing: 6) {
          ForEach(series) { s in
            let isHidden = hidden.contains(s.id)
            Button {
              if let onSelect { onSelect(s.id) }
              else if isHidden { hidden.remove(s.id) }
              else { hidden.insert(s.id) }
            } label: {
              HStack(spacing: 5) {
                Circle().fill(Color(oklch: s.color)).frame(width: 7, height: 7)
                Text(s.label).font(.caption2.weight(.semibold)).lineLimit(1)
                if let value = selection == nil ? s.latest : selection?.values[s.id] {
                  Text(UsdFormat.signedPercent(value)).font(.caption2.monospacedDigit())
                    .foregroundStyle(value >= 0 ? Color.gainGreen : Color.lossRed)
                } else { Text("—").font(.caption2) }
              }
              .padding(.horizontal, 8).padding(.vertical, 5)
              .opacity(isHidden ? 0.4 : 1)
              .glassEffect(.regular.interactive(), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("comparison-series-\(s.id)")
            .accessibilityValue(isHidden ? "Hidden" : "Visible")
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.25).onEnded { _ in pressed = pressed == s.id ? nil : s.id })
            .accessibilityAction(named: "Emphasize series") { pressed = pressed == s.id ? nil : s.id }
          }
          if !hidden.isEmpty {
            Button("Show all (\(hidden.count) hidden)") { hidden = [] }
              .font(.caption2).accessibilityIdentifier("comparison-show-all")
          }
        }
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}

/// The token page's rounded material tooltip, with a colored return per series.
/// It follows the scrubber without reserving permanent space beside the plot.
private struct ComparisonScrubTooltip: View {
  let selection: LivelineSelection
  let series: [MultiLineComparisonChart.Series]
  let hidden: Set<String>
  let focused: String?
  @ScaledMetric(relativeTo: .caption) private var preferredWidth = 250.0

  var body: some View {
    GeometryReader { geometry in
      let width = min(preferredWidth, geometry.size.width)
      let start = series.compactMap { $0.points.first?.epochSeconds }.min() ?? 0
      let end = series.compactMap { $0.points.last?.epochSeconds }.max() ?? 1
      let fraction = min(1, max(0, (selection.time - Double(start)) / max(1, Double(end - start))))
      let x = 8 + fraction * max(0, geometry.size.width - 20)
      let visible = series.filter { !hidden.contains($0.id) && selection.values[$0.id]?.isFinite == true }
      let ordered = visible.filter { $0.id == focused } + visible.filter { $0.id != focused }
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
          Text("+\(ordered.count - 5) more in legend").foregroundStyle(.secondary)
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

/// Inspection updates only the readout/legend, without rebuilding every series.
private struct NativeComparisonPlot: View, Equatable {
  let series: [MultiLineComparisonChart.Series]
  let hidden: Set<String>
  let pressed: String?
  let datasetID: String
  let scale: TimeScale
  let isActive: Bool
  let accessibilityID: String
  let onSelection: (LivelineSelection?) -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let input = MultiLineComparisonChart.input(series: series, hidden: hidden, pressed: pressed, datasetID: datasetID, scale: scale)
    var config = LivelineConfiguration()
    let _ = {
      config.fill = false; config.badge = false; config.dot = false
      config.pulse = false; config.extrema = false; config.referenceValue = 0
      config.reduceMotion = reduceMotion
      config.seriesLabels = Dictionary(uniqueKeysWithValues: series.map { ($0.id, $0.label) })
    }()
    ZStack {
      LivelineView(input: input, configuration: config, isActive: isActive && input.state == .ready,
        formatValue: { UsdFormat.signedPercent($0, fractionDigits: 1) },
        formatTime: { time in
          let date = Date(timeIntervalSince1970: time)
          return date.formatted(scale == .d1 ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day())
        }, onSelection: onSelection)
        .opacity(input.state == .ready ? 1 : 0)
        .accessibilityIdentifier(accessibilityID)
        .accessibilityLabel("Comparison performance chart")
      if input.state == .empty {
        Text(series.allSatisfy { hidden.contains($0.id) } ? "All series hidden" : "No chart data yet")
          .font(.footnote).foregroundStyle(.secondary).allowsHitTesting(false)
      }
    }
  }

  static func == (a: Self, b: Self) -> Bool {
    a.series == b.series && a.hidden == b.hidden && a.pressed == b.pressed
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
#Preview("Liveline comparison · toggle and scrub") {
  PreviewValue(Set<String>()) { hidden in
    MultiLineComparisonChart(series: [
      .init(id: "btc", label: "BTC", color: ChartColors.pastel[0], points: PreviewFixtures.returns),
      .init(id: "eth", label: "ETH", color: ChartColors.pastel[1], points: PreviewFixtures.returns.map { .init(epochSeconds: $0.epochSeconds, value: $0.value * 0.6 - 2) })
    ], hidden: hidden).frame(height: 300).padding().preferredColorScheme(.dark)
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
  PreviewValue(Set<String>()) { hidden in
    MultiLineComparisonChart(series: series, hidden: hidden).frame(height: 300).padding().preferredColorScheme(.dark)
  }
}
#endif
