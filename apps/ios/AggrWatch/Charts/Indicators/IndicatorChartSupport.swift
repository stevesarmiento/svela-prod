import AggrCore
import Charts
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

struct IndicatorWindow {
  let domain: ClosedRange<Date>
  let start: Date
  let length: TimeInterval
  let initial: Date
  var epochs: ClosedRange<Int> { Int(start.timeIntervalSince1970)...Int(start.addingTimeInterval(length).timeIntervalSince1970) }
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
}

/// Finite-only points for Swift Charts (Pine `na` = NaN would break paths).
struct IPt: Identifiable, Hashable {
  let id: Int
  let date: Date
  let value: Double
  var color: String? = nil
  init(_ p: TimePoint) { id = p.epochSeconds; date = p.date; value = p.value }
  init(_ p: ColoredPoint) { id = p.time; date = Date(timeIntervalSince1970: TimeInterval(p.time)); value = p.value; color = p.color }
  init(time: Int, value: Double) { id = time; date = Date(timeIntervalSince1970: TimeInterval(time)); self.value = value }
}

extension Array where Element == TimePoint {
  var chartPoints: [IPt] { compactMap { $0.value.isFinite ? IPt($0) : nil } }
}
extension Array where Element == ColoredPoint {
  var chartPoints: [IPt] { compactMap { $0.value.isFinite ? IPt($0) : nil } }
}

/// Crosshair rule shared by every pane (`ChartScrubStore`).
struct ScrubRule: ChartContent {
  let date: Date?
  var body: some ChartContent {
    if let date {
      RuleMark(x: .value("Selected", date))
        .foregroundStyle(Color.white.opacity(0.35))
        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
    }
  }
}

extension Array where Element == IPt {
  /// Nearest point to a scrubbed date (for annotations / readouts).
  func nearest(to date: Date?) -> IPt? {
    guard let date, !isEmpty else { return nil }
    return self.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
  }
}

/// Two series paired by timestamp (band fills).
struct BandPt: Identifiable, Hashable {
  let id: Int
  let date: Date
  let lower: Double
  let upper: Double
}

func pairBands(_ a: [IPt], _ b: [IPt]) -> [BandPt] {
  let byId = Dictionary(b.map { ($0.id, $0.value) }, uniquingKeysWith: { x, _ in x })
  return a.compactMap { p in byId[p.id].map { BandPt(id: p.id, date: p.date, lower: min(p.value, $0), upper: max(p.value, $0)) } }
}


extension Array where Element == IPt {
  /// Retain boundary neighbors for continuous paths, but avoid thousands of offscreen marks.
  func visible(in window: IndicatorWindow) -> [IPt] {
    guard let first = firstIndex(where: { $0.date >= window.start }) else { return Array(suffix(1)) }
    let end = firstIndex(where: { $0.date > window.start.addingTimeInterval(window.length) }) ?? count - 1
    return Array(self[Swift.max(0, first - 1)...Swift.max(first, end)])
  }
  var timePoints: [TimePoint] { map { .init(epochSeconds: $0.id, value: $0.value) } }
}

/// Contiguous color runs preserve the web's per-point coloring without joining unrelated colors.
struct IndicatorLine: ChartContent {
  let id: String
  let points: [IPt]
  var color: Color = .white
  var width: CGFloat = 1
  var opacity = 1.0
  var dash: [CGFloat] = []
  private struct Run: Identifiable { let id: Int; let color: String?; var points: [IPt] }
  private var runs: [Run] {
    guard let first = points.first else { return [] }
    var result = [Run(id: 0, color: first.color, points: [first])]
    for point in points.dropFirst() {
      let last = result.count - 1
      if point.color != result[last].color {
        let previous = result[last].points.last!
        result.append(Run(id: result.count, color: point.color, points: [previous, point]))
      } else { result[last].points.append(point) }
    }
    return result
  }
  var body: some ChartContent {
    ForEach(runs) { run in
      ForEach(run.points) { point in
        LineMark(x: .value("Time", point.date), y: .value(id, point.value), series: .value("Series", "\(id)-\(run.id)"))
          .foregroundStyle((run.color.map { Color(oklch: $0) } ?? color).opacity(opacity))
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
  let date: Date?
  let series: [(String, [IPt])]
  var body: some View {
    if let date {
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
