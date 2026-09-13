import AggrCore
import AggrLiveline
import SwiftUI
import UIKit

/// The data adapter is isolated from the scrub readout, so inspection doesn't rebuild overlay arrays.
struct AggrPriceChart: View, Equatable {
  let coinId: String
  let data: ParsedChartData
  let hull: HullSuite.Result
  let projection: PriceProjection.Result?
  let scale: TimeScale
  let liveObservation: LivelineObservation?
  let showPrice: Bool
  let showMarketCap: Bool
  let isLoading: Bool
  let isWarmingUp: Bool
  let hasObservedHistory: Bool
  let isActive: Bool
  var simplified = false
  let onSelection: (LivelineSelection?) -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  static func == (a: Self, b: Self) -> Bool {
    a.coinId == b.coinId && a.data == b.data && a.hull == b.hull && a.projection == b.projection
      && a.scale == b.scale && a.liveObservation == b.liveObservation && a.showPrice == b.showPrice
      && a.showMarketCap == b.showMarketCap && a.isLoading == b.isLoading && a.isWarmingUp == b.isWarmingUp
      && a.hasObservedHistory == b.hasObservedHistory && a.isActive == b.isActive && a.simplified == b.simplified
  }
  var body: some View {
    let input = Self.input(coinId: coinId, data: data, hull: hull, projection: projection,
                           scale: scale, liveObservation: liveObservation, showPrice: showPrice,
                           showMarketCap: showMarketCap, isLoading: isLoading, hasObservedHistory: hasObservedHistory,
                           simplified: simplified)
    var config = LivelineConfiguration()
    config.highlight = scale == .max || scale == .y2 ? .quarter : .month
    config.pulse = liveObservation != nil
    config.emptyText = isWarmingUp ? "Warming up chart data…" : "No chart data"
    config.reduceMotion = reduceMotion
    if simplified {
      config.fill = false
      config.grid = false
      config.timeAxis = false
      config.badge = false
      config.extrema = false
      config.highlight = .none
    }
    return LivelineView(input: input, configuration: config, isActive: isActive,
                        formatValue: { UsdFormat.price($0) }, formatVolume: { UsdFormat.largeUsd($0) },
                        formatTime: { time in
                          let date = Date(timeIntervalSince1970: time)
                          if simplified { return date.formatted(.dateTime.month(.abbreviated).day().year().hour().minute()) }
                          return date.formatted(scale == .y2 ? .dateTime.month(.abbreviated).year(.twoDigits) : .dateTime.month(.abbreviated).day())
                        }, onSelection: onSelection)
  }

  /// Interpolate window edges only when bracketed by actual observations.
  private static func clipped(_ points: [LivelinePoint], to range: ClosedRange<Double>) -> [LivelinePoint] {
    let valid = points.filter { $0.time.isFinite && $0.value.isFinite }.sorted { $0.time < $1.time }
    var result = valid.filter { range.contains($0.time) }
    for edge in [range.lowerBound, range.upperBound] where !result.contains(where: { $0.time == edge }) {
      if let before = valid.last(where: { $0.time < edge }), let after = valid.first(where: { $0.time > edge }) {
        let fraction = (edge - before.time) / (after.time - before.time)
        result.append(.init(time: edge, value: before.value + (after.value - before.value) * fraction))
      }
    }
    return result.sorted { $0.time < $1.time }
  }

  static func input(coinId: String, data: ParsedChartData, hull: HullSuite.Result, projection: PriceProjection.Result?,
                    scale: TimeScale, liveObservation: LivelineObservation?, showPrice: Bool, showMarketCap: Bool,
                    isLoading: Bool, hasObservedHistory: Bool, simplified: Bool = false) -> LivelineInput {
    func points(_ input: [TimePoint]) -> [LivelinePoint] { input.map { .init(time: Double($0.epochSeconds), value: $0.value) } }
    if simplified {
      let history = TokenPriceWindow(history: data.line, scale: scale)
      let line = hasObservedHistory ? points(history.points) : []
      let start = line.first?.time ?? 0
      let end = line.last?.time ?? 1
      // Keep the mobile presentation, with the same rebased market cap and Hull overlays.
      // Clip against the price window so sparse/older overlays cannot expand its time domain.
      let full = input(coinId: coinId, data: data, hull: hull, projection: nil, scale: scale,
                       liveObservation: nil, showPrice: showPrice, showMarketCap: showMarketCap,
                       isLoading: isLoading, hasObservedHistory: hasObservedHistory)
      var series = full.series.filter { ["price", "marketCap", "mhull", "shull"].contains($0.id) }
      for index in series.indices {
        if series[index].id == "price" {
          series[index].points = line
          series[index].width = 2.5
        } else {
          series[index].points = hasObservedHistory ? clipped(series[index].points, to: start...max(start, end)) : []
        }
      }
      return .init(id: "\(coinId)|\(scale.rawValue)|simple", series: series,
                   viewport: .historical(start...max(start + 60, end)),
                   observation: hasObservedHistory ? liveObservation : nil,
                   state: hasObservedHistory ? .ready : isLoading ? .loading : .empty)
    }
    func color(_ value: String) -> LivelineColor {
      var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 1
      UIColor(Color(oklch: value)).getRed(&r, green: &g, blue: &b, alpha: &a)
      return .init(r, g, b, a)
    }
    let closes = Dictionary(data.ohlc.map { ($0.time, $0.close) }, uniquingKeysWith: { a, _ in a })
    let shared = data.marketCap.first { $0.value > 0 && (closes[$0.epochSeconds] ?? 0) > 0 }
    let anchorPrice = shared.flatMap { closes[$0.epochSeconds] } ?? data.ohlc.first(where: { $0.close > 0 })?.close
    let anchorCap = shared?.value ?? data.marketCap.first(where: { $0.value > 0 })?.value
    let multiplier = anchorPrice.flatMap { p in anchorCap.map { p / $0 } }
    var series: [LivelineSeries] = [
      .init(id: "price", points: hasObservedHistory ? points(data.line) : [], width: 2, visible: showPrice),
      .init(id: "marketCap", points: points(data.marketCap), color: color("oklch(0.85 0.16 95 / 0.5)"),
            width: 1, dash: [2, 3], visible: showMarketCap && multiplier != nil, multiplier: multiplier ?? 1),
      .init(id: "mhull", points: points(hull.mhull), color: color(OklchColor.withAlpha(ChartColors.pastel[0], 0.7)), width: 1, dash: [1, 3]),
      .init(id: "shull", points: points(hull.shull), color: color(OklchColor.withAlpha(ChartColors.pastel[0], 0.45)), width: 1, dash: [1, 3])
    ]
    if let projection, hasObservedHistory {
      series += [
        .init(id: "projection", points: points(projection.base), color: .init(1, 1, 1, 0.55), width: 1, dash: [4, 4]),
        .init(id: "bull", points: points(projection.bull), color: color(OklchColor.withAlpha(ChartColors.candleUp, 0.55)), width: 1, dash: [4, 4]),
        .init(id: "bear", points: points(projection.bear), color: color(OklchColor.withAlpha(ChartColors.candleDown, 0.55)), width: 1, dash: [4, 4])
      ]
    }
    let first = Double(data.line.first?.epochSeconds ?? 0)
    let last = Double((projection?.base.last ?? data.line.last)?.epochSeconds ?? 1)
    return .init(id: "\(coinId)|\(scale.rawValue)", series: series, viewport: .historical(first...max(first + 60, last)),
                 observation: hasObservedHistory ? liveObservation : nil, volume: hasObservedHistory ? points(data.volume) : [],
                 band: projection != nil && hasObservedHistory ? ("bear", "bull") : nil,
                 projectionID: projection != nil && hasObservedHistory ? "projection" : nil,
                 state: hasObservedHistory ? .ready : isLoading ? .loading : data.line.isEmpty ? .empty : .placeholder)
  }
}

#if DEBUG
#Preview("Native Liveline · token overlays") {
  PreviewHost { env in
    let store = PreviewData.tokenStore(env)
    AggrPriceChart(coinId: "bitcoin", data: store.data, hull: store.hull, projection: store.projection,
                   scale: .d30, liveObservation: nil, showPrice: true, showMarketCap: true,
                   isLoading: false, isWarmingUp: false, hasObservedHistory: true, isActive: true,
                   onSelection: { _ in }).frame(height: 348).padding()
  }
}
#endif

#if DEBUG
/// Fixed observations make repeated Xcode previews comparable; no network or random samples.
private struct LivelineReplayPreview: View {
  @State private var step = 0
  @State private var paused = false
  @State private var loading = false
  @State private var selection: LivelineSelection?
  let tinyPrice: Bool
  private var unit: Double { tinyPrice ? 1e-10 : 1 }
  private var points: [LivelinePoint] {
    (0...120).map { i in
      LivelinePoint(time: 1_780_000_000 + Double(i), value: (100 + sin(Double(i) / 7) * 3 + Double(i) / 30) * unit)
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(tinyPrice ? "Tiny-price replay" : "Liveline replay").font(.title2.bold())
      Text(selection.map { String(format: tinyPrice ? "$%.10f" : "$%.2f", $0.value) } ?? "Drag to inspect")
        .font(.title3.monospacedDigit()).frame(height: 28)
      let observation = LivelineObservation(time: 1_780_000_120 + Double(step), value: (104 + sin(Double(step) / 3) * 5) * unit)
      let input = LivelineInput(id: "replay", series: [.init(id: "price", points: points)],
        viewport: .historical(1_780_000_000...1_780_000_180), observation: observation,
        state: loading ? .loading : .ready)
      var config = LivelineConfiguration()
      let _ = { config.paused = paused; config.pulse = true }()
      LivelineView(input: input, configuration: config,
        formatValue: { String(format: tinyPrice ? "$%.10f" : "$%.2f", $0) },
        formatTime: { "\(Int($0 - 1_780_000_000))s" }, onSelection: { selection = $0 })
        .frame(height: 280)
      HStack {
        Button(paused ? "Resume" : "Pause") { paused.toggle() }
        Button(loading ? "Show data" : "Loading") { loading.toggle() }
        Button("Restart") { step = 0 }
      }.buttonStyle(.bordered)
    }
    .padding().background(.black).preferredColorScheme(.dark)
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        if !paused { step += 1 }
      }
    }
  }
}
#Preview("Native Liveline · live replay") { LivelineReplayPreview(tinyPrice: false) }
#Preview("Native Liveline · tiny prices") { LivelineReplayPreview(tinyPrice: true) }
#endif
