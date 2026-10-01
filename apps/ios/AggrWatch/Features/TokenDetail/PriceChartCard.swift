import AggrAPI
import AggrCore
import AggrLiveline
import SwiftUI

/// The mobile price surface. The shared token header owns its readout.
struct PriceChartCard: View {
  let store: TokenChartStore
  @Binding var scale: TimeScale
  @Binding var selection: LivelineSelection?
  /// When set, selections route here (the token page's scrub store) instead of the binding;
  /// the binding stays the tooltip's read path.
  var onSelection: ((LivelineSelection?) -> Void)?
  @Environment(AppEnvironment.self) private var env
  @State private var lineColor: LivelineColor

  init(store: TokenChartStore, scale: Binding<TimeScale>, selection: Binding<LivelineSelection?>,
       onSelection: ((LivelineSelection?) -> Void)? = nil) {
    self.store = store
    _scale = scale
    _selection = selection
    self.onSelection = onSelection
    // Seed from the cache so a revisited token never flashes a white first frame.
    _lineColor = State(initialValue: TokenLineColor.cached(symbol: store.quote?.symbol ?? store.coinId,
                                                           imageURL: store.quote?.image) ?? .white)
  }

  var body: some View {
    let spot = env.realtime.spot(store.coinId)
    let pricing = LivePricing.resolve(quote: store.quote, spot: spot, alignedPrice: store.alignedPrice,
                                     isWarmingUp: store.isWarmingUp, status: env.realtime.status(store.coinId))
    VStack(spacing: 20) {
      AggrPriceChart(coinId: store.coinId, data: store.data, hull: store.hull, projection: nil,
                     scale: store.dataScale,
                     liveObservation: pricing.isLiveSpotTrusted ? spot.map { .init(time: $0.updatedAtMs / 1000, value: $0.priceUsd) } : nil,
                     showPrice: true, showMarketCap: true,
                     isLoading: store.isLoading, isWarmingUp: store.isWarmingUp,
                     hasObservedHistory: store.hasObservedHistory, isActive: env.isSceneActive, simplified: true,
                     lineColor: lineColor,
                     onSelection: { sel in
                       if let onSelection { onSelection(sel) } else { selection = sel }
                     })
        .equatable()
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
    .task(id: "\(store.quote?.symbol ?? store.coinId)|\(store.quote?.image ?? "")") {
      let symbol = store.quote?.symbol ?? store.coinId
      let imageURL = store.quote?.image
      guard let derived = await TokenLineColor.derive(symbol: symbol, imageURL: imageURL),
            !Task.isCancelled, store.quote?.image == imageURL else { return }
      lineColor = derived
    }
    .onChange(of: scale) { _, _ in selection = nil; onSelection?(nil) }
    .onDisappear { selection = nil; onSelection?(nil) }
    .padding(.bottom, 12)
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
