import AggrAPI
import AggrCore
import AggrLiveline
import Observation
import SwiftUI
import UIKit

/// `/watchlists/[id]` — price chart card, market metrics, (Phase 6: indicators, news, AI).
struct TokenDetailView: View {
  let coinId: String
  let groupSlug: String?
  var onClose: (() -> Void)? = nil
  var onArtworkChange: ((TokenPageArtwork) -> Void)? = nil
  @Environment(AppEnvironment.self) private var env
  @State private var store: TokenChartStore?
  @State private var scale: TimeScale = .d1
  @State private var chrome = TokenPageChrome()
  @ScaledMetric(relativeTo: .title) private var headerHeight = 154.0
  @Environment(\.dismiss) private var dismiss
  @State private var feed: MarketFeedStore?
  @State private var showFeed = false

  private var debugScrollBottom: Bool {
    #if DEBUG
    env.debugScrollBottom
    #else
    false
    #endif
  }

  var body: some View {
    let quote = store?.quote ?? env.watchlistData.quote(coinId)
    GeometryReader { pageGeometry in
      ScrollView {
        VStack(spacing: 20) {
          Color.clear.frame(height: headerHeight - 16)
          if let store {
            PriceChartCard(store: store, scale: $scale, chrome: chrome)
            MarketMetricsGrid(quote: quote, alignedPrice: store.alignedPrice, dailyOhlcv: store.dailyOhlcv, isPending: store.isLoading)
              .equatable()
            TokenIndicatorsSection(store: store, coinId: coinId, quote: quote)
          } else {
            RingLoader(size: .large).padding(.top, 80)
          }
        }
        .padding(16)
        .padding(.bottom, 32)
      }
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        max(0, geometry.contentOffset.y + geometry.contentInsets.top)
      } action: { _, offset in
        // Quantized: once the header has collapsed, further scrolling writes nothing.
        let textScale = headerHeight / 154
        let progress = min(1, max(0, offset / max(1, headerHeight - 84 * textScale)))
        let quantized = (progress * 100).rounded() / 100
        if chrome.headerProgress != quantized { chrome.headerProgress = quantized }
      }
      .overlay(alignment: .top) {
        TokenPageHeader(coinId: coinId, groupSlug: groupSlug, store: store, chrome: chrome, scale: scale,
                        expandedHeight: headerHeight, topInset: pageGeometry.safeAreaInsets.top, unseenNews: feed?.unseenCount ?? 0,
                        close: { if let onClose { onClose() } else { dismiss() } },
                        showNews: { showFeed = true },
                        showAnalysis: { env.router.openAnalysis([coinId], sourceID: "token-actions|\(coinId)") })
          .frame(height: headerHeight)
      }
      .defaultScrollAnchor(debugScrollBottom ? .bottom : .top)
      .scrollEdgeEffectStyle(.soft, for: .top)
      .background {
        // Blurred token-logo glow like the web token page.
        if onClose == nil, let quote {
          TokenLogoBackdrop(symbol: quote.symbol, imageURL: quote.image).equatable()
        }
      }
      .containerBackground(onClose == nil ? Theme.background : Color.clear, for: .navigation)
      .onChange(of: TokenPageArtwork(symbol: quote?.symbol ?? coinId, imageURL: quote?.image), initial: true) { _, artwork in
        onArtworkChange?(artwork)
      }
      .toolbar(.hidden, for: .navigationBar)
      .sheet(isPresented: $showFeed) {
        if let feed { MarketFeedSheet(store: feed, displayName: LogoOverrides.cleanTokenName(quote?.name ?? coinId)) }
      }
      .task(id: "\(coinId)|\(env.isSceneActive)|\(env.foregroundRevision)") {
        guard env.isSceneActive else { store?.stop(); feed?.stop(); return }
        let s = store ?? TokenChartStore(coinId: coinId, market: env.market, cache: env.queryCache, initialQuote: env.watchlistData.quote(coinId))
        store = s
        s.start(scale: scale)
        env.realtime.subscribe(coingeckoId: coinId, symbol: s.quote?.symbol)
        let environment = env
        let f = feed ?? MarketFeedStore(coinId: coinId, news: env.news, canMutate: { [weak environment] in environment?.isReadyForUserData ?? false })
        feed = f
        f.start()
      }
      .onChange(of: scale) { _, next in store?.setScale(next) }
      .onChange(of: store?.quote?.symbol) { previous, sym in
        // Curated coins stream by feed id and never need the symbol; everyone else resubscribes
        // only once, when the symbol first arrives, so an established stream is not torn down.
        guard env.isSceneActive, previous == nil, let sym, PythHermes.feedId(forCoingeckoId: coinId) == nil else { return }
        env.realtime.unsubscribe(coingeckoId: coinId); env.realtime.subscribe(coingeckoId: coinId, symbol: sym)
      }
      .onDisappear {
        store?.stop()
        feed?.stop()
        env.realtime.unsubscribe(coingeckoId: coinId)
      }
    }
  }
}

/// The 260pt blurred logo glow, keyed by artwork so quote polls never re-evaluate the blur.
private struct TokenLogoBackdrop: View, Equatable {
  let symbol: String
  let imageURL: String?

  var body: some View {
    TokenLogo(symbol: symbol, imageURL: imageURL, size: 260)
      .blur(radius: 90).opacity(0.35).offset(y: -180)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .ignoresSafeArea()
      .allowsHitTesting(false)
  }
}

/// The token page's scrub store plus the header's collapse progress (0 expanded … 1 compact),
/// quantized to 1/100 by the scroll observer.
@Observable
final class TokenPageChrome: ChartScrubStore {
  var headerProgress: Double = 0
}

/// One artwork control and one readout, moving into a compact header as the page scrolls.
/// This wrapper is the only view that reads the scroll progress; the readouts below observe
/// realtime ticks and scrub selections on their own.
private struct TokenPageHeader: View {
  let coinId: String
  let groupSlug: String?
  let store: TokenChartStore?
  let chrome: TokenPageChrome
  let scale: TimeScale
  let expandedHeight: CGFloat
  let topInset: CGFloat
  let unseenNews: Int
  let close: () -> Void
  let showNews: () -> Void
  let showAnalysis: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let textScale = expandedHeight / 154
    let progress = chrome.headerProgress
    // Direct manipulation has no trailing spring. Reduce Motion switches between the two layouts.
    let p = reduceMotion ? (progress < 0.5 ? 0.0 : 1.0) : progress
    GeometryReader { geometry in
      let width = geometry.size.width
      let nameScale = 1 - 0.1 * p
      let detailScale = 1 - 0.15 * p
      let nameX = 52 + 18 * p
      let nameAvailable = max(0, width - nameX - 120)
      let valueScale = 1 - (2.0 / 9.0) * p
      let textX = 20 + 58 * p
      let available = max(0, width - textX - (20 + 100 * p))
      ZStack(alignment: .topLeading) {
        // Tint the existing blurred backdrop without the gray lift of a system material.
        Rectangle().fill(Color.black.opacity(0.8))
          .frame(width: width, height: 110 * textScale + topInset)
          .mask(LinearGradient(stops: [.init(color: .black, location: 0),
                                       .init(color: .black, location: (topInset + 84 * textScale) / (topInset + 110 * textScale)),
                                       .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
          .offset(y: -topInset)
          .opacity(progress)
          .allowsHitTesting(false)
        Button(action: close) {
          TokenHeaderLogo(coinId: coinId, store: store)
            .scaleEffect(1 + 1.2 * p, anchor: .leading)
            .frame(width: 44, height: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: 20, y: 8 + 6 * p)
        .accessibilityLabel("Close token")
        .accessibilityIdentifier("token-page-close")

        if p < 0.5 {
          TokenHeaderNameLine(coinId: coinId, store: store, chrome: chrome)
            .frame(width: nameAvailable / nameScale, alignment: .leading)
            .scaleEffect(nameScale, anchor: .topLeading)
            .offset(x: nameX, y: (18 * (1 - p) + 7 * p) * textScale)
            .opacity(max(0, 1 - Double(p) * 2))
            .allowsHitTesting(false)
        }

        TokenHeaderPrice(coinId: coinId, store: store, chrome: chrome, scale: scale)
          .frame(width: available / valueScale, alignment: .leading)
          .clipped()
          .scaleEffect(valueScale, anchor: .topLeading)
          .offset(x: textX, y: (48 * (1 - p) + 8 * p) * textScale)
          .allowsHitTesting(false)

        TokenHeaderChangeRow(coinId: coinId, store: store, chrome: chrome, scale: scale)
          .frame(width: available / detailScale, alignment: .leading)
          .scaleEffect(detailScale, anchor: .topLeading)
          .offset(x: textX, y: (100 * (1 - p) + 48 * p) * textScale)
          .allowsHitTesting(false)

        HStack(spacing: 0) {
          WatchlistToggleButton(coinId: coinId, groupSlug: groupSlug)
            .frame(width: Theme.hitTarget, height: Theme.hitTarget)
            .accessibilityIdentifier("token-bookmark")
          Menu {
            Button(action: showAnalysis) { Label("Deep analysis", image: "ActionAnalyze") }
            Button(action: showNews) { Label(unseenNews > 0 ? "News (\(unseenNews) new)" : "News", systemImage: "newspaper") }
          } label: {
            Image(systemName: "ellipsis").font(.title3.weight(.semibold)).frame(width: Theme.hitTarget, height: Theme.hitTarget)
          }
          .accessibilityLabel("Token actions")
          .accessibilityIdentifier("token-actions")
        }
        .padding(.horizontal, 4)
        .glassEffect(.regular.interactive(), in: .capsule)
        // The analysis page zooms out of (and collapses back into) this capsule.
        .tokenTransitionSource("token-actions|\(coinId)", cornerRadius: 22)
        .buttonStyle(.plain)
        .tint(.white)
        .foregroundStyle(.white)
        .frame(width: width - 32, alignment: .trailing)
        .offset(x: 16, y: 8)
      }
      .frame(width: width, height: geometry.size.height, alignment: .topLeading)
    }
  }
}

/// `resolveLivePricing` for the header: the scrubbed value wins over the live price, and the
/// change is measured from the start of the visible window.
private struct TokenHeaderReadout {
  var name: String
  var price: Double?
  var change: Double?
  var dollarChange: Double?
  var periodLabel: String
  var isScrubbing: Bool

  static func resolve(coinId: String, store: TokenChartStore?, chrome: TokenPageChrome, scale: TimeScale, env: AppEnvironment) -> TokenHeaderReadout {
    let quote = store?.quote ?? env.watchlistData.quote(coinId)
    let spot = env.realtime.spot(coinId)
    let pricing = LivePricing.resolve(quote: quote, spot: spot, alignedPrice: store?.alignedPrice,
                                     isWarmingUp: store?.isWarmingUp ?? true, status: env.realtime.status(coinId))
    let selection = chrome.selection
    let price = selection?.value ?? pricing.livePrice
    let window = store?.priceWindow
    // An empty window reports partial history; fall back to the requested range like the wallet.
    let periodLabel = (window?.points.count ?? 0) >= 2 ? window!.periodLabel(scale: store?.dataScale ?? scale) : scale.periodLabel
    return TokenHeaderReadout(name: LogoOverrides.cleanTokenName(quote?.name ?? coinId), price: price,
                              change: window?.percentChange(to: price), dollarChange: window?.dollarChange(to: price),
                              periodLabel: periodLabel, isScrubbing: selection != nil)
  }
}

private struct TokenHeaderLogo: View {
  let coinId: String
  let store: TokenChartStore?
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let quote = store?.quote ?? env.watchlistData.quote(coinId)
    TokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 20)
      .glassEffect(.regular.interactive(), in: .circle)
  }
}

private struct TokenHeaderNameLine: View {
  let coinId: String
  let store: TokenChartStore?
  let chrome: TokenPageChrome
  @Environment(AppEnvironment.self) private var env
  @ScaledMetric(relativeTo: .title) private var titleSize = 20.0

  var body: some View {
    let quote = store?.quote ?? env.watchlistData.quote(coinId)
    Text("\(Text(LogoOverrides.cleanTokenName(quote?.name ?? coinId)).fontWeight(.medium)) \(Text(chrome.selection == nil ? "is currently" : "was").foregroundStyle(.secondary))")
      .font(.system(size: titleSize, weight: .regular, design: .rounded))
      .lineLimit(1).minimumScaleFactor(0.65)
      .accessibilityIdentifier("token-header-name")
  }
}

private struct TokenHeaderPrice: View {
  let coinId: String
  let store: TokenChartStore?
  let chrome: TokenPageChrome
  let scale: TimeScale
  @Environment(AppEnvironment.self) private var env
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @ScaledMetric(relativeTo: .title) private var priceSize = 36.0

  var body: some View {
    let readout = TokenHeaderReadout.resolve(coinId: coinId, store: store, chrome: chrome, scale: scale, env: env)
    let price = readout.price
    // Digits roll on live ticks; instant swaps while scrubbing (gesture-rate updates would
    // otherwise live in a mid-roll smear).
    Text(StyledUsd.price(price))
      .font(.number(size: priceSize))
      .contentTransition(.numericText(value: price ?? 0))
      .animation(readout.isScrubbing ? nil : Motion.animation(Motion.numeric, reduceMotion: reduceMotion), value: price)
      .lineLimit(1)
      .accessibilityLabel("\(readout.name) price")
      .accessibilityValue(price.map { UsdFormat.price($0) } ?? "Unavailable")
      .accessibilityIdentifier("token-header-price")
  }
}

private struct TokenHeaderChangeRow: View {
  let coinId: String
  let store: TokenChartStore?
  let chrome: TokenPageChrome
  let scale: TimeScale
  @Environment(AppEnvironment.self) private var env

  var body: some View {
    let readout = TokenHeaderReadout.resolve(coinId: coinId, store: store, chrome: chrome, scale: scale, env: env)
    HStack(spacing: 8) {
      Text(readout.dollarChange.map { UsdFormat.signedPrice($0) } ?? "—")
        .font(.number(.subheadline, weight: .medium))
        .foregroundStyle(Color.change(readout.dollarChange))
        .lineLimit(1).minimumScaleFactor(0.7)
        .accessibilityIdentifier("token-header-dollar-change")
      PercentBadge(pct: readout.change)
      Text(readout.periodLabel)
        .font(.system(.caption, design: .rounded))
        .foregroundStyle(.secondary)
        .lineLimit(1).minimumScaleFactor(0.6).layoutPriority(-1)
        .accessibilityIdentifier("token-header-period")
    }
  }
}

/// Bookmark toggle for the active group (`watchlist-button.tsx`).
struct WatchlistToggleButton: View {
  let coinId: String
  let groupSlug: String?
  var showsTitle = false
  @Environment(AppEnvironment.self) private var env
  @State private var pending = false

  var body: some View {
    let data = env.watchlistData
    let group = data.groups.first { $0.slug == groupSlug } ?? data.selectedGroup
    if let group {
      let inGroup = data.isInGroup(coinId, groupId: group.id)
      Button {
        pending = true
        Task {
          defer { pending = false }
          do {
            if inGroup { try await data.remove(coinId: coinId, from: group.id); env.toasts.success("Removed from \(group.name)") }
            else { try await data.add(coinId: coinId, to: group.id); env.toasts.success("Added to \(group.name)") }
          } catch { env.toasts.error("Could not update watchlist", error.localizedDescription) }
        }
      } label: {
        if showsTitle {
          Label(inGroup ? "Remove from \(group.name)" : "Add to \(group.name)", systemImage: inGroup ? "bookmark.fill" : "bookmark")
        } else {
          Image(systemName: inGroup ? "bookmark.fill" : "bookmark")
            .font(.title3.weight(.semibold))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
      }
      .disabled(pending)
      .accessibilityLabel(inGroup ? "Remove from \(group.name)" : "Add to \(group.name)")
    }
  }
}


#if DEBUG
#Preview("Token details") {
  PreviewHost { _ in TokenDetailView(coinId: "bitcoin", groupSlug: PreviewFixtures.group.slug) }
}
#Preview("Bookmark control") {
  PreviewHost { _ in WatchlistToggleButton(coinId: "bitcoin", groupSlug: PreviewFixtures.group.slug) }
}
#Preview("Compact token header") {
  PreviewHost(navigation: false) { env in
    let chrome = TokenPageChrome()
    let _ = { chrome.headerProgress = 1 }()
    TokenPageHeader(coinId: "bitcoin", groupSlug: PreviewFixtures.group.slug, store: PreviewData.tokenStore(env), chrome: chrome, scale: .d1,
                    expandedHeight: 154, topInset: 0, unseenNews: 2, close: {}, showNews: {}, showAnalysis: {})
      .frame(height: 154)
  }
}
#endif
