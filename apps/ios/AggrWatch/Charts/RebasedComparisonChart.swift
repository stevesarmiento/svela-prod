import AggrCore
import AggrLiveline
import SwiftUI

/// Binary-search lookups over series that are already sorted by time (bucketed overview series).
/// `OverviewPerformance.valueAt` / `closestTime` normalise or sort on every call; a scrub step
/// runs these at display rate, so they must be O(log n).
nonisolated enum SeriesLookup {
  /// Sorted, time-unique copy; the input is returned untouched when it is already in order.
  static func sortedUnique(_ points: [TimePoint]) -> [TimePoint] {
    var ordered = true
    var last = Int.min
    for p in points {
      if p.epochSeconds <= last || !p.value.isFinite { ordered = false; break }
      last = p.epochSeconds
    }
    if ordered { return points }
    var byTime: [Int: Double] = [:]
    for p in points where p.value.isFinite { byTime[p.epochSeconds] = p.value }
    return byTime.keys.sorted().map { TimePoint(epochSeconds: $0, value: byTime[$0]!) }
  }

  /// Index of the first point at or after `time` in a sorted series.
  private static func lowerBound(_ points: [TimePoint], _ time: Int) -> Int {
    var lo = 0, hi = points.count
    while lo < hi {
      let mid = (lo + hi) / 2
      if points[mid].epochSeconds < time { lo = mid + 1 } else { hi = mid }
    }
    return lo
  }

  /// Nearest point value in a sorted series (ties prefer the left neighbour).
  static func nearestValue(_ points: [TimePoint], time: Int) -> Double? {
    nearest(points, time: time)?.value
  }

  /// Nearest point in a sorted series (ties prefer the left neighbour).
  static func nearest(_ points: [TimePoint], time: Int) -> TimePoint? {
    guard !points.isEmpty else { return nil }
    let lo = lowerBound(points, time)
    if lo < points.count, points[lo].epochSeconds == time { return points[lo] }
    let right = lo < points.count ? points[lo] : nil
    let left = lo > 0 ? points[lo - 1] : nil
    switch (left, right) {
    case (nil, nil): return nil
    case (nil, let r?): return r
    case (let l?, nil): return l
    case (let l?, let r?): return abs(l.epochSeconds - time) <= abs(r.epochSeconds - time) ? l : r
    }
  }

  /// Nearest time in a sorted, unique list of times (ties prefer the left neighbour).
  static func nearestTime(_ times: [Int], to time: Int) -> Int? {
    guard !times.isEmpty else { return nil }
    var lo = 0, hi = times.count
    while lo < hi {
      let mid = (lo + hi) / 2
      if times[mid] < time { lo = mid + 1 } else { hi = mid }
    }
    if lo < times.count, times[lo] == time { return time }
    let right = lo < times.count ? times[lo] : nil
    let left = lo > 0 ? times[lo - 1] : nil
    switch (left, right) {
    case (nil, nil): return nil
    case (nil, let r?): return r
    case (let l?, nil): return l
    case (let l?, let r?): return abs(l - time) <= abs(r - time) ? l : r
    }
  }
}

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
      // Only the legend observes the scrub position; the plot below is unaffected by a scrub step.
      RebasedLegend(portfolio: portfolio, market: market, scrubTime: $scrubTime)
      RebasedLivelinePlot(portfolio: portfolio, market: market, scale: scale, isActive: isActive,
                          reduceMotion: reduceMotion, onScrub: { scrubTime = $0 })
        .equatable()
    }
  }
}

/// Scrub readouts for both lines. Lookups are binary searches over the memoised sorted series.
private struct RebasedLegend: View {
  let portfolio: [TimePoint]
  let market: [TimePoint]
  @Binding var scrubTime: Int?
  @State private var preparation = RebasedLegendPreparation()

  var body: some View {
    let sorted = preparation.sorted(portfolio: portfolio, market: market)
    HStack(spacing: 16) {
      if let value = readout(sorted.portfolio) { legend("Portfolio", value, .white) }
      if let value = readout(sorted.market) { legend("Market", value, .mint.opacity(0.8)) }
    }
  }

  private func readout(_ points: [TimePoint]) -> Double? {
    scrubTime.flatMap { SeriesLookup.nearestValue(points, time: $0) } ?? points.last?.value
  }

  private func legend(_ name: String, _ value: Double, _ color: Color) -> some View {
    HStack(spacing: 5) {
      Circle().fill(color).frame(width: 6, height: 6)
      Text("\(name) \(UsdFormat.signedPercent(value - 100))")
        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
    }
  }
}

/// Unobserved memo: sorting happens once per data change, never per scrub step.
@MainActor private final class RebasedLegendPreparation {
  private var portfolio: [TimePoint] = []
  private var market: [TimePoint] = []
  private var sortedPortfolio: [TimePoint] = []
  private var sortedMarket: [TimePoint] = []

  func sorted(portfolio: [TimePoint], market: [TimePoint]) -> (portfolio: [TimePoint], market: [TimePoint]) {
    if portfolio != self.portfolio { self.portfolio = portfolio; sortedPortfolio = SeriesLookup.sortedUnique(portfolio) }
    if market != self.market { self.market = market; sortedMarket = SeriesLookup.sortedUnique(market) }
    return (sortedPortfolio, sortedMarket)
  }
}

/// Memoised Liveline input keyed on (portfolio, market, scale), plus the merged time axis used
/// to snap a selection to the nearest charted time. Never schedules a SwiftUI render itself.
@MainActor final class RebasedChartPreparation {
  private var portfolio: [TimePoint] = []
  private var market: [TimePoint] = []
  private var scale: TimeScale?
  private var prepared: LivelineInput?
  private(set) var times: [Int] = []
  #if DEBUG
  private(set) var preparationCount = 0
  #endif

  func input(portfolio: [TimePoint], market: [TimePoint], scale: TimeScale) -> LivelineInput {
    if prepared == nil || self.portfolio != portfolio || self.market != market || self.scale != scale {
      prepared = RebasedComparisonChart.input(portfolio: portfolio, market: market, scale: scale)
      times = Array(Set(portfolio.map(\.epochSeconds) + market.map(\.epochSeconds))).sorted()
      self.portfolio = portfolio; self.market = market; self.scale = scale
      #if DEBUG
      preparationCount += 1
      #endif
    }
    return prepared!
  }
}

/// The Liveline plot, isolated so a legend update or scrub step never rebuilds its input.
private struct RebasedLivelinePlot: View, Equatable {
  let portfolio: [TimePoint]
  let market: [TimePoint]
  let scale: TimeScale
  let isActive: Bool
  let reduceMotion: Bool
  let onScrub: (Int?) -> Void
  @State private var preparation = RebasedChartPreparation()

  var body: some View {
    let input = preparation.input(portfolio: portfolio, market: market, scale: scale)
    let times = preparation.times
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
        onScrub(selection.flatMap { SeriesLookup.nearestTime(times, to: Int($0.time)) })
      })
      .accessibilityIdentifier("overview-performance-chart")
      .accessibilityLabel("Portfolio and total market cap performance chart")
  }

  static func == (a: Self, b: Self) -> Bool {
    a.portfolio == b.portfolio && a.market == b.market && a.scale == b.scale
      && a.isActive == b.isActive && a.reduceMotion == b.reduceMotion
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
