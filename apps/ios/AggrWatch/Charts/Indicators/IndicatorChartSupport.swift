import AggrCore
import Charts
import Observation
import SwiftUI

/// Each pane pans/zooms independently; the selected candle is shared across panes.
struct IndicatorViewport {
  var start = Date.distantPast
  var zoom = 1.0

  func window(points: [IPt], days: Int) -> IndicatorWindow {
    let first = points.first?.date ?? Date(timeIntervalSince1970: 0)
    let last = points.last?.date ?? first.addingTimeInterval(1)
    let cadence = points.count > 1 ? max(1, last.timeIntervalSince(points[points.count - 2].date)) : 1
    let end = last.addingTimeInterval(cadence)
    let span = max(cadence, end.timeIntervalSince(first))
    let length = min(span, max(min(span, cadence * 10), Double(days * 86_400) / zoom + cadence))
    let initial = max(first, end.addingTimeInterval(-length))
    let visibleStart = start == .distantPast ? initial : min(max(first, start), end.addingTimeInterval(-length))
    return IndicatorWindow(domain: first...end, start: visibleStart, length: length, initial: initial)
  }
}

struct IndicatorWindow: Equatable {
  let domain: ClosedRange<Date>
  let start: Date
  let length: TimeInterval
  let initial: Date
  var epochs: ClosedRange<Int> { Int(start.timeIntervalSince1970)...Int(start.addingTimeInterval(length).timeIntervalSince1970) }
}

/// The crosshair date shared by the four indicator panes (and their readouts). Charts write it
/// from their own selection state; only the rule/readout overlays observe it, so a scrub step
/// never re-diffs another pane's mark tree.
@Observable
final class IndicatorScrubStore {
  var date: Date?
  func set(_ next: Date?) { if next != date { date = next } }
}

struct IndicatorPaneModifier: ViewModifier {
  let window: IndicatorWindow
  let windowDays: Int
  @Binding var viewport: IndicatorViewport
  let yDomain: ClosedRange<Double>
  var height: CGFloat = 250
  var horizontalGrid = true
  @State private var initialZoom: Double?

  func body(content: Content) -> some View {
    content
      .chartXScale(domain: window.domain)
      .chartScrollableAxes(.horizontal)
      .chartXVisibleDomain(length: window.length)
      .chartScrollPosition(x: Binding(get: { window.start }, set: { viewport.start = $0 }))
      .chartYScale(domain: yDomain)
      .chartXAxis {
        AxisMarks(values: .automatic(desiredCount: 4)) { _ in
          AxisValueLabel(format: .dateTime.month(.abbreviated).day(), centered: false)
            .font(.system(size: 9, design: .rounded)).foregroundStyle(.secondary)
        }
      }
      .chartYAxis {
        AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
          if horizontalGrid { AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [1, 3])).foregroundStyle(Color.white.opacity(0.06)) }
          AxisValueLabel().font(.number(size: 9, weight: .regular)).foregroundStyle(.secondary)
        }
      }
      .chartPlotStyle { $0.clipped() }
      .frame(height: height)
      .onAppear { if viewport.start == .distantPast { viewport.start = window.initial } }
      .onChange(of: windowDays) { _, _ in viewport.zoom = 1; viewport.start = .distantPast }
      .onChange(of: window.domain.lowerBound) { _, _ in viewport.start = .distantPast }
      .simultaneousGesture(MagnifyGesture()
        .onChanged { value in
          if initialZoom == nil { initialZoom = viewport.zoom }
          viewport.zoom = min(12, max(0.25, (initialZoom ?? 1) * value.magnification))
        }
        .onEnded { _ in initialZoom = nil })
  }
}

extension View {
  func indicatorPane(window: IndicatorWindow, windowDays: Int, viewport: Binding<IndicatorViewport>, yDomain: ClosedRange<Double>, height: CGFloat = 250, horizontalGrid: Bool = true) -> some View {
    modifier(IndicatorPaneModifier(window: window, windowDays: windowDays, viewport: viewport, yDomain: yDomain, height: height, horizontalGrid: horizontalGrid))
  }

  /// Shared crosshair + selection plumbing for one indicator pane. `selection` is the pane's own
  /// Swift Charts selection; it is snapped to `anchor` and published through `scrub`.
  func indicatorScrub(selection: Binding<Date?>, scrub: IndicatorScrubStore, anchor: [IPt], external: Binding<Date?>? = nil) -> some View {
    self
      .chartXSelection(value: selection)
      .chartOverlay { proxy in IndicatorScrubRule(scrub: scrub, proxy: proxy) }
      .onChange(of: selection.wrappedValue) { _, next in
        scrub.set(next.flatMap { anchor.nearest(to: $0)?.date })
        external?.wrappedValue = next
      }
  }
}

/// Finite-only points for Swift Charts (Pine `na` = NaN would break paths). Built off-main when
/// an `IndicatorBundle` lands, so chart bodies only slice.
nonisolated struct IPt: Identifiable, Hashable, Sendable {
  let id: Int
  let date: Date
  let value: Double
  var color: String? = nil
  init(_ p: TimePoint) { id = p.epochSeconds; date = p.date; value = p.value }
  init(_ p: ColoredPoint) { id = p.time; date = Date(timeIntervalSince1970: TimeInterval(p.time)); value = p.value; color = p.color }
  init(time: Int, value: Double, color: String? = nil) { id = time; date = Date(timeIntervalSince1970: TimeInterval(time)); self.value = value; self.color = color }
}

/// A mark whose color is already resolved (bars, flags, diamonds).
nonisolated struct TintedPt: Identifiable, Hashable, Sendable {
  let id: Int
  let date: Date
  let value: Double
  let tint: Color
  init(_ p: ColoredPoint, fallback: String, alpha: Double? = nil) {
    id = p.time; date = Date(timeIntervalSince1970: TimeInterval(p.time)); value = p.value
    let base = p.color ?? fallback
    tint = Color(oklch: alpha.map { OklchColor.withAlpha(base, $0) } ?? base)
  }
}

nonisolated extension Array where Element == TimePoint {
  var chartPoints: [IPt] { compactMap { $0.value.isFinite ? IPt($0) : nil } }
}
nonisolated extension Array where Element == ColoredPoint {
  var chartPoints: [IPt] { compactMap { $0.value.isFinite ? IPt($0) : nil } }
}

/// A time-ordered chart mark; `id` is its epoch second.
nonisolated protocol TimedMark { var id: Int { get }; var date: Date { get } }
extension IPt: TimedMark {}
extension TintedPt: TimedMark {}
extension BandPt: TimedMark {}

nonisolated extension Array where Element: TimedMark {
  /// Window plus one neighbor on each side, for continuous paths; see `[IPt].visible(in:)`.
  func visibleSlice(in window: IndicatorWindow) -> ArraySlice<Element> {
    let first = partitionIndex { $0.date >= window.start }
    guard first < count else { return suffix(1) }
    let past = partitionIndex { $0.date > window.start.addingTimeInterval(window.length) }
    let end = past < count ? past : count - 1
    return self[Swift.max(0, first - 1)...Swift.max(first, end)]
  }

  /// Marks strictly inside the visible epochs (markers that must not leak past the edge).
  func within(_ epochs: ClosedRange<Int>) -> ArraySlice<Element> {
    let lower = partitionIndex { $0.id >= epochs.lowerBound }
    let upper = partitionIndex { $0.id > epochs.upperBound }
    return lower < upper ? self[lower..<upper] : []
  }
}

nonisolated extension RandomAccessCollection {
  /// First index whose element satisfies `predicate`, which must be monotone over the collection
  /// (false…false, true…true). `endIndex` when none does.
  func partitionIndex(where predicate: (Element) -> Bool) -> Index {
    var low = startIndex, high = endIndex
    while low < high {
      let mid = index(low, offsetBy: distance(from: low, to: high) / 2)
      if predicate(self[mid]) { high = mid } else { low = index(after: mid) }
    }
    return low
  }
}

nonisolated extension Array where Element == IPt {
  /// Nearest point to a scrubbed date (for annotations / readouts). Points are time-ordered.
  func nearest(to date: Date?) -> IPt? {
    guard let date, !isEmpty else { return nil }
    let upper = partitionIndex { $0.date >= date }
    guard upper < count else { return self[count - 1] }
    guard upper > 0 else { return self[0] }
    let before = self[upper - 1], after = self[upper]
    return date.timeIntervalSince(before.date) <= after.date.timeIntervalSince(date) ? before : after
  }

  /// Retain boundary neighbors for continuous paths, but avoid thousands of offscreen marks.
  func visible(in window: IndicatorWindow) -> [IPt] {
    let first = partitionIndex { $0.date >= window.start }
    guard first < count else { return Array(suffix(1)) }
    let past = partitionIndex { $0.date > window.start.addingTimeInterval(window.length) }
    let end = past < count ? past : count - 1
    return Array(self[Swift.max(0, first - 1)...Swift.max(first, end)])
  }

  /// Several sparse marker series merged into one time-ordered array.
  static func merged(_ parts: [ColoredPoint]...) -> [IPt] {
    parts.flatMap { $0 }.sorted { $0.time < $1.time }.chartPoints
  }

  var timePoints: [TimePoint] { map { .init(epochSeconds: $0.id, value: $0.value) } }
}

nonisolated enum IndicatorYDomain {
  /// `IndicatorPlotScale.domain` over several time-ordered series, visiting only visible samples.
  static func compute(series: [[IPt]], visible: ClosedRange<Int>, anchors: [Double] = [], margin: Double = 0.1) -> ClosedRange<Double> {
    var low = Double.infinity, high = -Double.infinity
    for points in series {
      for p in points.within(visible) { low = Swift.min(low, p.value); high = Swift.max(high, p.value) }
    }
    // Two synthetic in-window samples carry the extremes so the scale math stays in AggrCore.
    let extremes: [TimePoint] = low.isFinite ? [.init(epochSeconds: visible.lowerBound, value: low), .init(epochSeconds: visible.lowerBound, value: high)] : []
    return IndicatorPlotScale.domain(points: extremes, visible: visible, anchors: anchors, margin: margin)
  }
}

/// Two series paired by timestamp (band fills).
nonisolated struct BandPt: Identifiable, Hashable, Sendable {
  let id: Int
  let date: Date
  let lower: Double
  let upper: Double
}

nonisolated func pairBands(_ a: [IPt], _ b: [IPt]) -> [BandPt] {
  let byId = Dictionary(b.map { ($0.id, $0.value) }, uniquingKeysWith: { x, _ in x })
  return a.compactMap { p in byId[p.id].map { BandPt(id: p.id, date: p.date, lower: min(p.value, $0), upper: max(p.value, $0)) } }
}

/// Everything the four indicator panes draw, converted once per `IndicatorBundle` off the main
/// actor. Equality is identity: a prepared value never changes after construction.
nonisolated struct IndicatorChartData: Sendable, Equatable {
  let marketVision: MarketVisionChartData
  let bollinger: BollingerChartData
  let bbwp: BBWPChartData
  let rsi: RsiChartData

  init(_ bundle: IndicatorBundle) {
    marketVision = MarketVisionChartData(bundle.marketVision)
    bollinger = BollingerChartData(bundle.bollinger)
    bbwp = BBWPChartData(bundle.bbwp)
    rsi = RsiChartData(bundle.rsiDivergences)
  }
}

/// Dashed crosshair drawn over the plot area from the shared scrub date; only this view
/// observes the store, so the chart's marks are left alone while another pane is scrubbed.
struct IndicatorScrubRule: View {
  let scrub: IndicatorScrubStore
  let proxy: ChartProxy

  var body: some View {
    GeometryReader { geometry in
      if let date = scrub.date, let anchor = proxy.plotFrame, let x = proxy.position(forX: date) {
        // Under scrollable axes the proxy reports content-relative x and the plot anchor carries
        // the scroll offset (negative minX), so their sum is the position in this overlay.
        let frame = geometry[anchor]
        let visibleX = frame.minX + x
        if visibleX >= 0, visibleX <= geometry.size.width {
          Path { path in
            path.move(to: CGPoint(x: visibleX, y: frame.minY))
            path.addLine(to: CGPoint(x: visibleX, y: frame.maxY))
          }
          .stroke(Color.white.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
          .accessibilityIdentifier("indicator-scrub-rule")
        }
      }
    }
    .allowsHitTesting(false)
  }
}

/// Contiguous color runs preserve the web's per-point coloring without joining unrelated colors.
/// Runs (and their series keys / resolved colors) are built once per construction, not per mark.
struct IndicatorLine: ChartContent {
  let id: String
  let points: [IPt]
  var color: Color = .white
  var width: CGFloat = 1
  var opacity = 1.0
  var dash: [CGFloat] = []
  private let runs: [Run]

  private struct Run: Identifiable {
    let id: Int
    let series: String
    let stroke: Color
    var points: [IPt]
  }

  init(id: String, points: [IPt], color: Color = .white, width: CGFloat = 1, opacity: Double = 1.0, dash: [CGFloat] = []) {
    self.id = id; self.points = points; self.color = color; self.width = width; self.opacity = opacity; self.dash = dash
    runs = Self.runs(points, id: id, base: color, opacity: opacity)
  }

  private static func runs(_ points: [IPt], id: String, base: Color, opacity: Double) -> [Run] {
    guard let first = points.first else { return [] }
    func stroke(_ color: String?) -> Color { (color.map { Color(oklch: $0) } ?? base).opacity(opacity) }
    var result = [Run(id: 0, series: "\(id)-0", stroke: stroke(first.color), points: [first])]
    var currentColor = first.color
    for point in points.dropFirst() {
      let last = result.count - 1
      if point.color != currentColor {
        let previous = result[last].points.last!
        currentColor = point.color
        result.append(Run(id: result.count, series: "\(id)-\(result.count)", stroke: stroke(point.color), points: [previous, point]))
      } else { result[last].points.append(point) }
    }
    return result
  }

  var body: some ChartContent {
    ForEach(runs) { run in
      ForEach(run.points) { point in
        LineMark(x: .value("Time", point.date), y: .value(id, point.value), series: .value("Series", run.series))
          .foregroundStyle(run.stroke)
          .lineStyle(StrokeStyle(lineWidth: width, dash: dash))
          .interpolationMethod(.linear)
      }
    }
  }
}

struct IndicatorArea: ChartContent {
  let id: String
  let points: [IPt]
  let color: Color
  var body: some ChartContent {
    ForEach(points) { p in
      AreaMark(x: .value("Time", p.date), y: .value(id, p.value), series: .value("Area", id), stacking: .unstacked)
        .foregroundStyle(color).interpolationMethod(.linear)
    }
  }
}

struct IndicatorDots: ChartContent {
  let points: [IPt]
  let color: Color
  var diameter: CGFloat = 6
  var opacity = 1.0
  var body: some ChartContent {
    ForEach(Array(points.enumerated()), id: \.offset) { _, p in
      PointMark(x: .value("Time", p.date), y: .value("Signal", p.value))
        .foregroundStyle((p.color.map { Color(oklch: $0) } ?? color).opacity(opacity))
        .symbolSize(diameter * diameter)
    }
  }
}

/// Same compact material readout used elsewhere on the token page; no permanent labels over the plot.
struct IndicatorReadout: View {
  let scrub: IndicatorScrubStore
  let series: [(String, [IPt])]
  var body: some View {
    if let date = scrub.date {
      VStack(alignment: .leading, spacing: 4) {
        Text(date, format: .dateTime.month(.abbreviated).day().hour().minute()).foregroundStyle(.secondary)
        ForEach(Array(series.enumerated()), id: \.offset) { _, item in
          if let point = item.1.nearest(to: date) {
            HStack { Text(item.0); Spacer(minLength: 12); Text(point.value, format: .number.precision(.fractionLength(2))).monospacedDigit() }
          }
        }
      }
      .font(.system(.caption, design: .rounded))
      .padding(10).frame(width: 180)
      .background(.ultraThinMaterial, in: .rect(cornerRadius: Theme.Radius.sm))
      .padding(4).allowsHitTesting(false)
    }
  }
}
