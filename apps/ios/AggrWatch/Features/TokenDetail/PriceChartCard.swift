import AggrAPI
import AggrCore
import Charts
import SwiftUI

/// Port of `price-chart.tsx`: header (logo, name, scrub/live price, 24h badge), 1M/1Y/2Y selector,
/// Price / Mkt cap legend toggles, spot status pill, chart body + volume pane.
struct PriceChartCard: View {
  let store: TokenChartStore
  @Binding var scale: TimeScale
  @Binding var showPrice: Bool
  @Binding var showMarketCap: Bool
  @Environment(AppEnvironment.self) private var env
  @State private var selectedDate: Date?

  var body: some View {
    let quote = store.quote
    let spot = env.realtime.spot(store.coinId)
    let streamStatus = env.realtime.status(store.coinId)
    let pricing = LivePricing.resolve(quote: quote, spot: spot, alignedPrice: store.alignedPrice, isWarmingUp: store.isWarmingUp, status: streamStatus)
    let status = pricing.status
    let scrub = selectedDate.flatMap { scrubValues(at: $0) }

    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            TokenLogo(symbol: quote?.symbol ?? store.coinId, imageURL: quote?.image, size: 16)
            Text(LogoOverrides.cleanTokenName(quote?.name ?? store.coinId)).font(.caption).foregroundStyle(.secondary)
            SpotStatusPill(status: status)
          }
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            AnimatedNumber(value: scrub?.price ?? pricing.livePrice, font: .system(size: 28, weight: .semibold, design: .rounded))
              .lineLimit(1).minimumScaleFactor(0.6)
            if let scrub, let base = pricing.basePrice, base > 0 {
              PercentBadge(pct: (scrub.price - base) / base * 100)
            } else {
              PercentBadge(pct: pricing.liveChange24h)
            }
          }
          if let scrub {
            HStack(spacing: 10) {
              Text(scrub.date, format: .dateTime.month(.abbreviated).day().year().hour().minute()).foregroundStyle(.secondary)
              if let mcap = scrub.marketCap { Text("MCAP \(UsdFormat.largeUsd(mcap))").foregroundStyle(Color(oklch: "oklch(0.85 0.16 95 / 0.8)")) }
              if let proj = scrub.projection { Text("Proj \(UsdFormat.price(proj.base)) · ▲\(UsdFormat.price(proj.bull)) · ▼\(UsdFormat.price(proj.bear))").foregroundStyle(.secondary) }
            }
            .font(.caption2.monospacedDigit())
          }
        }
        Spacer()
        TimeScalePicker(scales: TimeScale.tokenScales, selection: $scale)
      }

      PriceChart(
        line: store.data.line, ohlc: store.data.ohlc, marketCap: showMarketCap ? store.data.marketCap : [],
        hull: store.hull, projection: store.projection, livePriceUsd: pricing.isLiveSpotTrusted ? pricing.livePrice : nil,
        showPrice: showPrice, scale: scale, selectedDate: $selectedDate
      )
      .frame(height: 280)
      .overlay {
        if store.isLoading && store.data.line.isEmpty { ProgressView() }
        else if store.data.line.count < 2 { Text(store.isWarmingUp ? "Warming up chart data…" : "No chart data").font(.footnote).foregroundStyle(.secondary) }
      }

      if store.data.volume.contains(where: { $0.value > 0 }) {
        VolumeChart(volume: store.data.volume, domain: xDomain)
          .frame(height: 56)
      }

      HStack(spacing: 8) {
        LegendToggle(title: "PRICE", color: .white, isOn: $showPrice)
        LegendToggle(title: "MKT CAP", color: Color(oklch: "oklch(0.85 0.16 95 / 0.9)"), isOn: $showMarketCap)
        if store.isStale { Text("stale · refreshing").font(.caption2).foregroundStyle(.secondary) }
        Spacer()
        if let e = store.error { Text(e).font(.caption2).foregroundStyle(Color.lossRed).lineLimit(1) }
      }
    }
    .padding(14)
    .glassEffect(.regular, in: .rect(cornerRadius: 20))
  }

  private var xDomain: ClosedRange<Date>? {
    guard let first = store.data.line.first, let last = (store.projection?.base.last ?? store.data.line.last) else { return nil }
    return first.date...last.date
  }

  private struct ScrubValues { var date: Date; var price: Double; var marketCap: Double?; var projection: (base: Double, bull: Double, bear: Double)? }

  private func scrubValues(at date: Date) -> ScrubValues? {
    let t = date.timeIntervalSince1970
    func nearest(_ pts: [TimePoint]) -> TimePoint? {
      guard !pts.isEmpty else { return nil }
      var lo = 0, hi = pts.count - 1
      while hi - lo > 1 { let mid = (lo + hi) / 2; if Double(pts[mid].epochSeconds) <= t { lo = mid } else { hi = mid } }
      return abs(Double(pts[lo].epochSeconds) - t) <= abs(Double(pts[hi].epochSeconds) - t) ? pts[lo] : pts[hi]
    }
    if let last = store.data.line.last, t > Double(last.epochSeconds), let proj = store.projection {
      guard let b = nearest(proj.base), let u = nearest(proj.bull), let d = nearest(proj.bear) else { return nil }
      return ScrubValues(date: b.date, price: b.value, marketCap: nil, projection: (b.value, u.value, d.value))
    }
    guard let p = nearest(store.data.line) else { return nil }
    return ScrubValues(date: p.date, price: p.value, marketCap: nearest(store.data.marketCap)?.value, projection: nil)
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

struct LegendToggle: View {
  let title: String
  let color: Color
  @Binding var isOn: Bool
  var body: some View {
    Button { withAnimation(.snappy) { isOn.toggle() } } label: {
      HStack(spacing: 5) {
        Circle().fill(color).frame(width: 6, height: 6)
        Text(title).font(.system(size: 9, weight: .semibold, design: .monospaced)).tracking(1)
      }
      .padding(.horizontal, 8).padding(.vertical, 5)
      .foregroundStyle(isOn ? .primary : .secondary)
      .opacity(isOn ? 1 : 0.55)
      .glassEffect(.regular.interactive(), in: Capsule())
    }
    .buttonStyle(.plain)
  }
}

/// LIVE / WARM / CACHED pill with pulsing dot (`spotStatus`).
struct SpotStatusPill: View {
  let status: RealtimeQuoteStatus
  var body: some View {
    if status != .disabled {
      HStack(spacing: 4) {
        Circle().fill(color).frame(width: 5, height: 5)
          .phaseAnimator([0.4, 1.0]) { view, phase in view.opacity(status == .realtime ? phase : 1) } animation: { _ in .easeInOut(duration: 0.9) }
        Text(status.label).font(.system(size: 8, weight: .bold, design: .monospaced)).tracking(1)
      }
      .padding(.horizontal, 6).padding(.vertical, 3)
      .foregroundStyle(color)
      .background(color.opacity(0.12), in: Capsule())
    }
  }
  private var color: Color {
    switch status { case .realtime: .gainGreen; case .lastKnown: .yellow; default: .secondary }
  }
}
