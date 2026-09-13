import AggrAPI
import AggrCore
import AggrLiveline
import Charts
import SwiftUI

/// The mobile price surface. The shared token header owns its readout.
struct PriceChartCard: View {
  let store: TokenChartStore
  @Binding var scale: TimeScale
  @Binding var selection: LivelineSelection?
  @Environment(AppEnvironment.self) private var env
  @State private var selectedDate: Date?
  #if DEBUG
  @AppStorage("charts.useLegacyPriceRenderer") private var useLegacyRenderer = false
  #else
  @AppStorage("charts.useLegacyPriceRenderer") private var useLegacyRenderer = true
  #endif

  var body: some View {
    let spot = env.realtime.spot(store.coinId)
    let pricing = LivePricing.resolve(quote: store.quote, spot: spot, alignedPrice: store.alignedPrice,
                                     isWarmingUp: store.isWarmingUp, status: env.realtime.status(store.coinId))
    VStack(spacing: 20) {
      Group {
        if useLegacyRenderer {
          MinimalLegacyPriceChart(input: AggrPriceChart.input(
            coinId: store.coinId, data: store.data, hull: store.hull, projection: nil,
            scale: store.dataScale, liveObservation: nil, showPrice: true, showMarketCap: true,
            isLoading: store.isLoading, hasObservedHistory: store.hasObservedHistory, simplified: true),
                                  livePrice: pricing.isLiveSpotTrusted ? pricing.livePrice : nil,
                                  selectedDate: $selectedDate)
            .onChange(of: selectedDate) { _, date in
              guard let date, let point = store.priceWindow.points.min(by: {
                abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date))
              }) else { selection = nil; return }
              selection = .init(time: Double(point.epochSeconds), value: point.value, values: ["price": point.value],
                                isProjection: false, nearestObservation: nil)
            }
            .overlay {
              if !store.hasObservedHistory {
                if store.isLoading { ProgressView() }
                else { Text("Price history unavailable").font(.footnote).foregroundStyle(.secondary) }
              }
            }
        } else {
          AggrPriceChart(coinId: store.coinId, data: store.data, hull: store.hull, projection: nil,
                         scale: store.dataScale,
                         liveObservation: pricing.isLiveSpotTrusted ? spot.map { .init(time: $0.updatedAtMs / 1000, value: $0.priceUsd) } : nil,
                         showPrice: true, showMarketCap: true,
                         isLoading: store.isLoading, isWarmingUp: store.isWarmingUp,
                         hasObservedHistory: store.hasObservedHistory, isActive: env.isSceneActive, simplified: true,
                         onSelection: { selection = $0 })
            .equatable()
        }
      }
      .frame(height: 260)
      .overlay(alignment: .top) {
        if let selection {
          PriceScrubTooltip(selection: selection, points: store.priceWindow.points)
        }
      }
      TimeScalePicker(scales: TimeScale.tokenScales, selection: $scale)
      if store.error != nil {
        HStack(spacing: 8) {
          Text(store.hasObservedHistory ? "Couldn’t refresh chart" : "Price history unavailable")
            .font(.caption).foregroundStyle(.secondary)
          Button("Retry") { Task { await store.load(force: true) } }.font(.caption.weight(.semibold))
        }
      }
    }
    .onChange(of: scale) { _, _ in selectedDate = nil; selection = nil }
    .onDisappear { selection = nil }
    .padding(.bottom, 12)
  }
}

/// Keeps the release fallback visually consistent during the native renderer rollout.
private struct MinimalLegacyPriceChart: View {
  let input: LivelineInput
  let livePrice: Double?
  @Binding var selectedDate: Date?
  private var line: [TimePoint] {
    var result = (input.series.first { $0.id == "price" }?.points ?? []).map {
      TimePoint(epochSeconds: Int($0.time), value: $0.value)
    }
    if let livePrice, let last = result.last { result[result.count - 1] = .init(epochSeconds: last.epochSeconds, value: livePrice) }
    return result
  }
  var body: some View {
    let values = line
    let overlays = input.series.filter { $0.id != "price" && $0.visible }
    let allValues = values.map(\.value) + overlays.flatMap { series in series.points.map { $0.value * series.multiplier } }
    let low = allValues.min() ?? 0
    let high = allValues.max() ?? 1
    let padding = max((high - low) * 0.12, abs(high) * 0.001, 1e-20)
    Chart {
      ForEach(values, id: \.epochSeconds) { point in
        LineMark(x: .value("Time", point.date), y: .value("Price", point.value), series: .value("Series", "price"))
          .interpolationMethod(.monotone).foregroundStyle(.white)
          .lineStyle(.init(lineWidth: 2.5, lineCap: .round))
      }
      overlayContent(overlays)
      if let last = values.last {
        PointMark(x: .value("Time", last.date), y: .value("Price", last.value)).foregroundStyle(.white).symbolSize(35)
      }
      if let selectedDate {
        RuleMark(x: .value("Selected", selectedDate)).foregroundStyle(.white.opacity(0.3))
      }
    }
    .chartXSelection(value: $selectedDate)
    .chartYScale(domain: (low - padding)...(high + padding))
    .chartXAxis(.hidden).chartYAxis(.hidden).chartLegend(.hidden)
    .padding(.vertical, 14)
    .accessibilityIdentifier("legacy-price-chart")
  }

  @ChartContentBuilder
  private func overlayContent(_ overlays: [LivelineSeries]) -> some ChartContent {
    ForEach(overlays, id: \.id) { series in
      overlaySeries(series)
    }
  }

  @ChartContentBuilder
  private func overlaySeries(_ series: LivelineSeries) -> some ChartContent {
    let color = Color(.sRGB, red: series.color.red, green: series.color.green,
                      blue: series.color.blue, opacity: series.color.alpha)
    let stroke = StrokeStyle(lineWidth: CGFloat(series.width), dash: series.dash.map { CGFloat($0) })
    ForEach(series.points, id: \.time) { point in
      LineMark(x: .value("Time", Date(timeIntervalSince1970: point.time)),
               y: .value("Price", point.value * series.multiplier), series: .value("Series", series.id))
        .interpolationMethod(.monotone)
        .foregroundStyle(color)
        .lineStyle(stroke)
    }
  }

}

/// Date/time stays beside the inspected chart, with its capsule kept inside both edges.
private struct PriceScrubTooltip: View {
  let selection: LivelineSelection
  let points: [TimePoint]
  @ScaledMetric(relativeTo: .caption) private var preferredWidth = 210.0

  var body: some View {
    GeometryReader { geometry in
      let width = min(preferredWidth, geometry.size.width)
      let start = Double(points.first?.epochSeconds ?? 0)
      let end = Double(points.last?.epochSeconds ?? 1)
      let fraction = min(1, max(0, (selection.time - start) / max(1, end - start)))
      Text(Date(timeIntervalSince1970: selection.time), format: .dateTime.month(.abbreviated).day().year().hour().minute())
        .font(.system(.caption, design: .rounded, weight: .medium).monospacedDigit())
        .lineLimit(1).minimumScaleFactor(0.7)
        .padding(.vertical, 7)
        .frame(width: width)
        .background(.regularMaterial, in: Capsule())
        .position(x: min(geometry.size.width - width / 2, max(width / 2, geometry.size.width * fraction)), y: 18)
        .accessibilityIdentifier("price-chart-inspection")
    }
    .allowsHitTesting(false)
  }
}

/// `resolveLivePricing`: live spot is trusted only when 0.05 < spot/reference < 20.
enum LivePricing {
  struct Result { var livePrice: Double?; var liveChange24h: Double?; var isLiveSpotTrusted: Bool; var basePrice: Double?; var status: RealtimeQuoteStatus }

  static func resolve(quote: CoinQuote?, spot: RealtimePriceCoordinator.LiveSpot?, alignedPrice: Double?, isWarmingUp: Bool, status: RealtimeQuoteStatus = .fallback, now: Date = .now) -> Result {
    func positive(_ value: Double?) -> Double? { value.flatMap { $0.isFinite && $0 > 0 ? $0 : nil } }
    let reference = positive(quote?.currentPrice) ?? positive(alignedPrice)
    var trusted = false
    if let spot, !isWarmingUp, spot.priceUsd.isFinite, spot.priceUsd > 0 {
      let age = now.timeIntervalSince1970 * 1000 - spot.updatedAtMs
      let quoteTime = (quote?.lastUpdatedDate?.timeIntervalSince1970 ?? 0) * 1000
      let fresh = spot.source == .pyth
        ? status == .realtime && age >= -5_000 && age <= 7_500
        : age >= -5_000 && age <= 300_000 && spot.updatedAtMs > quoteTime
      let ratio = reference.map { spot.priceUsd / $0 } ?? 1
      trusted = fresh && ratio.isFinite && ratio > 0.05 && ratio < 20
    }
    let live = trusted ? spot!.priceUsd : reference
    // Base = price 24h ago inferred from the quote's 24h % change.
    var base: Double? = nil
    var change: Double? = quote?.priceChangePercentage24h
    if let p = quote?.currentPrice, let pct = quote?.priceChangePercentage24h, pct.isFinite, 1 + pct / 100 > 0 {
      base = p / (1 + pct / 100)
      if trusted, let live, let b = base, b > 0 { change = (live - b) / b * 100 }
    }
    return Result(livePrice: live, liveChange24h: change, isLiveSpotTrusted: trusted, basePrice: base, status: trusted ? (spot?.source == .pyth ? .realtime : .lastKnown) : .fallback)
  }
}


#if DEBUG
#Preview("Mobile price chart") {
  PreviewHost { env in
    PriceChartCard(store: PreviewData.tokenStore(env), scale: .constant(.d30), selection: .constant(nil)).padding()
  }
}
#Preview("Loading price chart") {
  PreviewHost { env in
    PriceChartCard(store: PreviewData.tokenStore(env, loading: true), scale: .constant(.d30), selection: .constant(nil)).padding()
  }
}
#endif
