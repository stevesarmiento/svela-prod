import AggrCore
import Charts
import SwiftUI

/// N normalized (% return) lines with per-series pastel colors, legend toggles, and right-edge labels.
/// Used by Compare (per watchlist group) and Watchlists → Chart (per coin).
struct MultiLineComparisonChart: View {
  struct Series: Identifiable, Hashable {
    let id: String
    let label: String
    let color: String   // oklch
    let points: [TimePoint]
    var latest: Double? { points.last?.value }
  }

  let series: [Series]
  @Binding var hidden: Set<String>
  var onSelect: ((String) -> Void)? = nil
  @State private var selectedDate: Date?
  @State private var pressed: String?

  private struct Pt: Identifiable { let id: String; let date: Date; let value: Double; let series: String }

  var body: some View {
    let visible = series.filter { !hidden.contains($0.id) }
    let pts = visible.flatMap { s in s.points.map { Pt(id: "\(s.id)-\($0.epochSeconds)", date: $0.date, value: $0.value, series: s.id) } }
    let scale = Dictionary(uniqueKeysWithValues: series.map { ($0.id, Color(oklch: pressed == nil || pressed == $0.id ? $0.color : OklchColor.withAlpha($0.color, 0.25))) })
    VStack(alignment: .leading, spacing: 8) {
      Chart {
        RuleMark(y: .value("Zero", 0)).foregroundStyle(Color.white.opacity(0.12))
        ForEach(pts) { p in
          LineMark(x: .value("Time", p.date), y: .value("Return", p.value), series: .value("Series", p.series))
            .interpolationMethod(.monotone)
            .foregroundStyle(by: .value("Series", p.series))
            .lineStyle(StrokeStyle(lineWidth: pressed == p.series ? 2.2 : 1.4))
        }
        if let selectedDate {
          RuleMark(x: .value("Selected", selectedDate)).foregroundStyle(Color.white.opacity(0.3)).lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 5]))
        }
      }
      .chartForegroundStyleScale(domain: series.map(\.id), range: series.map { scale[$0.id] ?? .gray })
      .chartXSelection(value: $selectedDate)
      .chartYScale(domain: .automatic(includesZero: false))
      .chartYAxis {
        AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { v in
          AxisGridLine().foregroundStyle(Color.white.opacity(0.05))
          AxisValueLabel { if let d = v.as(Double.self) { Text(UsdFormat.signedPercent(d, fractionDigits: 1)).font(.system(size: 9, design: .monospaced)) } }
        }
      }
      .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { v in AxisValueLabel { if let d = v.as(Date.self) { Text(d, format: .dateTime.month(.abbreviated).day()).font(.system(size: 9)) } } } }
      .chartLegend(.hidden)
      .chartOverlay { proxy in
        GeometryReader { geo in
          // Right-edge labels following the scrub (or latest) value.
          ForEach(visible) { s in
            if let v = value(of: s, at: selectedDate), let y = proxy.position(forY: v) {
              Text("\(s.label) \(UsdFormat.signedPercent(v, fractionDigits: 1))")
                .font(.system(size: 8, weight: .semibold, design: .monospaced))
                .padding(.horizontal, 4).padding(.vertical, 1)
                .background(Color(oklch: s.color).opacity(0.9), in: Capsule())
                .foregroundStyle(.black)
                .position(x: geo.size.width - 40, y: min(max(y, 8), geo.size.height - 8))
                .allowsHitTesting(false)
            }
          }
        }
      }
      legend
    }
  }

  private func value(of s: Series, at date: Date?) -> Double? {
    guard let date else { return s.latest }
    let t = Int(date.timeIntervalSince1970)
    return OverviewPerformance.valueAt(s.points, time: t)
  }

  private var legend: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(series) { s in
          let isHidden = hidden.contains(s.id)
          Button {
            if let onSelect { onSelect(s.id) } else { withAnimation(.snappy) { if isHidden { hidden.remove(s.id) } else { hidden.insert(s.id) } } }
          } label: {
            HStack(spacing: 5) {
              Circle().fill(Color(oklch: s.color)).frame(width: 7, height: 7)
              Text(s.label).font(.caption2.weight(.semibold)).lineLimit(1)
              if let v = s.latest { Text(UsdFormat.signedPercent(v)).font(.caption2.monospacedDigit()).foregroundStyle(v >= 0 ? Color.gainGreen : Color.lossRed) }
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .opacity(isHidden ? 0.4 : 1)
            .glassEffect(.regular.interactive(), in: Capsule())
          }
          .buttonStyle(.plain)
          .simultaneousGesture(LongPressGesture(minimumDuration: 0.25).onEnded { _ in pressed = pressed == s.id ? nil : s.id })
        }
        if !hidden.isEmpty {
          Button("Show all (\(hidden.count) hidden)") { withAnimation { hidden = [] } }.font(.caption2)
        }
      }
    }
  }
}

#if DEBUG
#Preview("Toggle and scrub series") {
  PreviewValue(Set<String>()) { hidden in
    MultiLineComparisonChart(series: [
      .init(id: "btc", label: "BTC", color: ChartColors.pastel[0], points: PreviewFixtures.returns),
      .init(id: "eth", label: "ETH", color: ChartColors.pastel[1], points: PreviewFixtures.returns.map { .init(epochSeconds: $0.epochSeconds, value: $0.value * 0.6 - 2) })
    ], hidden: hidden).frame(height: 300).padding().preferredColorScheme(.dark)
  }
}
#endif
