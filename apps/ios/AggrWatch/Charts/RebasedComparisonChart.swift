import AggrCore
import AggrLiveline
import SwiftUI

/// Native Liveline counterpart to the web's portfolio / global market comparison.
/// Both lines share a baseline of 100; dollar readouts remain in the overview header.
struct RebasedComparisonChart: View {
  let portfolio: [TimePoint]
  let market: [TimePoint]
  @Binding var scrubTime: Int?
  var scale: TimeScale = .d1
  var isActive = true
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  static func input(portfolio: [TimePoint], market: [TimePoint], scale: TimeScale) -> LivelineInput {
    func points(_ source: [TimePoint]) -> [LivelinePoint] {
      source.filter { $0.value.isFinite }.map { .init(time: Double($0.epochSeconds), value: $0.value) }
        .sorted { $0.time < $1.time }
    }
    let p = points(portfolio), m = points(market)
    let times = (p + m).map(\.time)
    let start = times.min() ?? 0, end = times.max() ?? 1
    return .init(id: "overview|\(scale.rawValue)", series: [
      .init(id: "portfolio", points: p, width: 2.5),
      .init(id: "market", points: m, color: .init(0.42, 0.82, 0.73, 0.55), width: 1.5)
    ], primaryID: p.isEmpty ? "market" : "portfolio", viewport: .historical(start...max(start + 60, end)),
      state: times.isEmpty ? .empty : .ready)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 16) {
        if let value = readout(portfolio) { legend("Portfolio", value, .white) }
        if let value = readout(market) { legend("Market", value, .mint.opacity(0.8)) }
      }
      let input = Self.input(portfolio: portfolio, market: market, scale: scale)
      var config = LivelineConfiguration()
      let _ = {
        config.fill = false; config.grid = false; config.badge = false
        config.pulse = false; config.extrema = false; config.timeAxis = false
        config.referenceValue = 100; config.reduceMotion = reduceMotion
      }()
      LivelineView(input: input, configuration: config, isActive: isActive,
        formatValue: { UsdFormat.signedPercent($0 - 100) },
        formatTime: { Date(timeIntervalSince1970: $0).formatted(.dateTime.month(.abbreviated).day().year().hour().minute()) },
        onSelection: { selection in
          scrubTime = selection.flatMap { OverviewPerformance.closestTime(portfolio + market, to: Int($0.time)) }
        })
        .accessibilityIdentifier("overview-performance-chart")
        .accessibilityLabel("Portfolio and total market cap performance chart")
    }
  }

  private func readout(_ points: [TimePoint]) -> Double? {
    scrubTime.flatMap { OverviewPerformance.valueAt(points, time: $0) } ?? points.last?.value
  }

  private func legend(_ name: String, _ value: Double, _ color: Color) -> some View {
    HStack(spacing: 5) {
      Circle().fill(color).frame(width: 6, height: 6)
      Text("\(name) \(UsdFormat.signedPercent(value - 100))")
        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
    }
  }
}

#if DEBUG
#Preview("Portfolio vs total market · Liveline") {
  PreviewValue(Int?.none) { scrub in
    let p = OverviewPerformance.rebaseFromFirstPoint(PreviewFixtures.line)
    RebasedComparisonChart(portfolio: p, market: p.map { .init(epochSeconds: $0.epochSeconds, value: 100 + ($0.value - 100) * 0.65) }, scrubTime: scrub)
      .frame(height: 260).padding().preferredColorScheme(.dark)
  }
}
#Preview("Market without holdings · Liveline") {
  PreviewValue(Int?.none) { scrub in
    RebasedComparisonChart(portfolio: [], market: OverviewPerformance.rebaseFromFirstPoint(PreviewFixtures.chart.marketCap), scrubTime: scrub)
      .frame(height: 260).padding().preferredColorScheme(.dark)
  }
}
#endif
