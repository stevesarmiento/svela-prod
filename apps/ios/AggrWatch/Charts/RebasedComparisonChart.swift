import AggrCore
import Charts
import SwiftUI

/// `overview-performance-chart.tsx`: portfolio vs market, both rebased to 100; scrub reports the nearest time.
struct RebasedComparisonChart: View {
  let portfolio: [TimePoint]
  let market: [TimePoint]
  @Binding var scrubTime: Int?
  @State private var selected: Date?

  private struct Pt: Identifiable { let id: String; let date: Date; let value: Double; let series: String }

  var body: some View {
    let pts = portfolio.map { Pt(id: "p\($0.epochSeconds)", date: $0.date, value: $0.value, series: "Portfolio") }
      + market.map { Pt(id: "m\($0.epochSeconds)", date: $0.date, value: $0.value, series: "Market") }
    let all = (portfolio + market).sorted { $0.epochSeconds < $1.epochSeconds }
    let includeYear = (all.last?.epochSeconds ?? 0) - (all.first?.epochSeconds ?? 0) > 180 * 86_400
    let pLast = portfolio.last?.value, mLast = market.last?.value
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 12) {
        if let pLast { legend("Portfolio \(UsdFormat.signedPercent(pLast - 100))", Color(oklch: "oklch(0.9276 0.0058 264.53)")) }
        if let mLast { legend("Market \(UsdFormat.signedPercent(mLast - 100))", Color(oklch: "oklch(0.7845 0.1325 181.91 / 0.8)")) }
      }
      Chart {
        RuleMark(y: .value("Base", 100)).foregroundStyle(Color.white.opacity(0.12)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
        ForEach(pts) { p in
          LineMark(x: .value("Time", p.date), y: .value("Index", p.value), series: .value("Series", p.series))
            .interpolationMethod(.monotone)
            .foregroundStyle(by: .value("Series", p.series))
            .lineStyle(StrokeStyle(lineWidth: p.series == "Portfolio" ? 1.8 : 1.4))
        }
        if let selected {
          RuleMark(x: .value("Selected", selected)).foregroundStyle(Color.white.opacity(0.3)).lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 5]))
        }
      }
      .chartForegroundStyleScale(["Portfolio": Color(oklch: "oklch(0.9276 0.0058 264.53)"), "Market": Color(oklch: "oklch(0.7845 0.1325 181.91 / 0.25)")])
      .chartXSelection(value: $selected)
      .chartYScale(domain: .automatic(includesZero: false))
      .chartYAxis {
        AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { v in
          AxisGridLine().foregroundStyle(Color.white.opacity(0.05))
          AxisValueLabel { if let d = v.as(Double.self) { Text(String(format: "%.0f", d)).font(.system(size: 9, design: .rounded).monospacedDigit()) } }
        }
      }
      .chartXAxis {
        AxisMarks(values: .automatic(desiredCount: 4)) { v in
          AxisValueLabel { if let d = v.as(Date.self) { Text(d, format: includeYear ? .dateTime.month(.abbreviated).day().year() : .dateTime.month(.abbreviated).day()).font(.system(size: 9)) } }
        }
      }
      .chartLegend(.hidden)
      .onChange(of: selected) { _, d in
        scrubTime = d.flatMap { OverviewPerformance.closestTime(all, to: Int($0.timeIntervalSince1970)) }
      }
    }
  }

  private func legend(_ text: String, _ color: Color) -> some View {
    HStack(spacing: 5) { Circle().fill(color).frame(width: 6, height: 6); Text(text).font(.caption2.monospacedDigit()).foregroundStyle(.secondary) }
  }
}

#if DEBUG
#Preview("Portfolio vs market") {
  PreviewValue(Int?.none) { scrub in
    RebasedComparisonChart(portfolio: PreviewFixtures.returns, market: PreviewFixtures.returns.map { .init(epochSeconds: $0.epochSeconds, value: $0.value * 0.65) }, scrubTime: scrub)
      .frame(height: 260).padding().preferredColorScheme(.dark)
  }
}
#endif
