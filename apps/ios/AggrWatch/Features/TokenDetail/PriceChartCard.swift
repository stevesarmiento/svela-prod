import AggrAPI
import AggrCore
import AggrLiveline
import SwiftUI

/// The mobile price surface. The shared token header owns its readout.
struct PriceChartCard: View {
  let store: TokenChartStore
  @Binding var scale: TimeScale
  /// The token page's scrub store: selections are published through it and the tooltip reads
  /// the renderer x it recorded.
  let chrome: TokenPageChrome
  @Environment(AppEnvironment.self) private var env
  @State private var lineColor: LivelineColor

  init(store: TokenChartStore, scale: Binding<TimeScale>, chrome: TokenPageChrome) {
    self.store = store
    _scale = scale
    self.chrome = chrome
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
                     onSelection: { chrome.setSelection($0) })
        .equatable()
        .frame(height: 260)
        .overlay(alignment: .top) {
          if let selection = chrome.selection {
            PriceScrubTooltip(selection: selection, x: chrome.selectionX ?? 0, scale: store.dataScale)
          }
        }
      TimeScalePicker(scales: TimeScale.tokenScales, selection: $scale)
      if store.error != nil {
        HStack(spacing: 8) {
          Text(store.hasObservedHistory ? "Couldn’t refresh chart" : "Price history unavailable")
            .font(.footnote).foregroundStyle(.secondary)
          Button("Retry") { Task { await store.load(force: true) } }
            .font(.caption.weight(.semibold)).buttonStyle(.glass).controlSize(.small)
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
    .onChange(of: scale) { _, _ in chrome.setSelection(nil) }
    .onDisappear { chrome.setSelection(nil) }
    .padding(.bottom, 12)
  }
}

/// Date/time stays beside the inspected chart, pinned to the renderer's crosshair x with its
/// capsule kept inside both edges.
private struct PriceScrubTooltip: View {
  let selection: LivelineSelection
  let x: CGFloat
  let scale: TimeScale
  @ScaledMetric(relativeTo: .subheadline) private var shortWidth = 86.0

  var body: some View {
    GeometryReader { geometry in
      let width = min(preferredWidth, geometry.size.width)
      Text(timestamp)
        .font(.number(.subheadline, weight: .medium))
        .foregroundStyle(.secondary)
        .lineLimit(1).minimumScaleFactor(0.7)
        .padding(.vertical, 7)
        .frame(width: width)
        .background(Theme.elevated, in: Capsule())
        .position(x: min(geometry.size.width - width / 2, max(width / 2, x)), y: 16)
        .accessibilityIdentifier("price-chart-inspection")
    }
    .allowsHitTesting(false)
  }

  private var preferredWidth: CGFloat {
    switch scale {
    case .d1: shortWidth
    case .d7, .d30: shortWidth * 1.9
    case .max, .y2: shortWidth * 1.5
    }
  }

  private var timestamp: String {
    let date = Date(timeIntervalSince1970: selection.time)
    switch scale {
    case .d1: return date.formatted(.dateTime.hour().minute())
    case .d7, .d30: return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    case .max, .y2: return date.formatted(.dateTime.month(.abbreviated).day().year())
    }
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
    PriceChartCard(store: PreviewData.tokenStore(env), scale: .constant(.d30), chrome: TokenPageChrome()).padding()
  }
}
#Preview("Loading price chart") {
  PreviewHost { env in
    PriceChartCard(store: PreviewData.tokenStore(env, loading: true), scale: .constant(.d30), chrome: TokenPageChrome()).padding()
  }
}
#endif
