import AggrCore
import Charts
import SwiftUI

/// Shared plumbing for the four ~250pt indicator panes (`indicator-chart-setup.ts`):
/// horizontal scroll, initial visible window (14/30/60 days), shared crosshair, dark grid.
struct IndicatorPaneModifier: ViewModifier {
  let windowDays: Int
  let lastDate: Date?
  let yDomain: ClosedRange<Double>?
  var height: CGFloat = 250

  func body(content: Content) -> some View {
    let window = TimeInterval(windowDays * 86_400)
    content
      .chartScrollableAxes(.horizontal)
      .chartXVisibleDomain(length: window)
      .chartScrollPosition(initialX: (lastDate ?? .now).addingTimeInterval(-window))
      .modifier(FixedYDomain(domain: yDomain))
      .chartXAxis {
        AxisMarks(values: .automatic(desiredCount: 4)) { _ in
          AxisGridLine().foregroundStyle(Color.white.opacity(0.06))
          AxisValueLabel(format: windowDays <= 14 ? .dateTime.month(.abbreviated).day() : .dateTime.month(.abbreviated).day(), centered: false)
            .font(.system(size: 9)).foregroundStyle(.secondary)
        }
      }
      .chartYAxis {
        AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
          AxisGridLine().foregroundStyle(Color.white.opacity(0.06))
          AxisValueLabel().font(.system(size: 9, design: .rounded).monospacedDigit()).foregroundStyle(.secondary)
        }
      }
      .frame(height: height)
  }

  private struct FixedYDomain: ViewModifier {
    let domain: ClosedRange<Double>?
    func body(content: Content) -> some View {
      if let domain { content.chartYScale(domain: domain) } else { content }
    }
  }
}

extension View {
  func indicatorPane(windowDays: Int, lastDate: Date?, yDomain: ClosedRange<Double>? = nil, height: CGFloat = 250) -> some View {
    modifier(IndicatorPaneModifier(windowDays: windowDays, lastDate: lastDate, yDomain: yDomain, height: height))
  }
}

/// Finite-only points for Swift Charts (Pine `na` = NaN would break paths).
struct IPt: Identifiable, Hashable {
  let id: Int
  let date: Date
  let value: Double
  init(_ p: TimePoint) { id = p.epochSeconds; date = p.date; value = p.value }
  init(_ p: ColoredPoint) { id = p.time; date = Date(timeIntervalSince1970: TimeInterval(p.time)); value = p.value }
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
