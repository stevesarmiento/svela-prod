import AggrAPI
import AggrCore
import SwiftUI

/// `/watchlists/[id]` — price chart card, market metrics, (Phase 6: indicators, news, AI).
struct TokenDetailView: View {
  let coinId: String
  let groupSlug: String?
  @Environment(AppEnvironment.self) private var env
  @State private var store: TokenChartStore?
  @State private var scale: TimeScale = .d30
  @State private var showPrice = true
  @State private var showMarketCap = true
  @State private var feed: MarketFeedStore?
  @State private var showFeed = false
  @State private var showDeepAnalysis = false

  private var debugScrollBottom: Bool {
    #if DEBUG
    env.debugScrollBottom
    #else
    false
    #endif
  }

  var body: some View {
    let quote = store?.quote ?? env.watchlistData.quote(coinId)
    ScrollView {
      VStack(spacing: 20) {
        if let store {
          PriceChartCard(store: store, scale: $scale, showPrice: $showPrice, showMarketCap: $showMarketCap)
          MarketMetricsGrid(quote: quote, alignedPrice: store.alignedPrice, dailyOhlcv: store.dailyOhlcv, isPending: store.isLoading)
          TokenIndicatorsSection(store: store, coinId: coinId, quote: quote)
        } else {
          ProgressView().padding(.top, 80)
        }
      }
      .padding(16)
      .padding(.bottom, 32)
    }
    .defaultScrollAnchor(debugScrollBottom ? .bottom : .top)
    .background {
      // Blurred token-logo glow like the web token page.
      if let quote {
        TokenLogo(symbol: quote.symbol, imageURL: quote.image, size: 260)
          .blur(radius: 90).opacity(0.35).offset(y: -180)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
          .ignoresSafeArea()
          .allowsHitTesting(false)
      }
    }
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .principal) {
        HStack(spacing: 8) {
          TokenLogo(symbol: quote?.symbol ?? coinId, imageURL: quote?.image, size: 24)
          VStack(spacing: 0) {
            Text((quote?.symbol ?? coinId).uppercased()).font(.headline)
            Text(Date.now, format: .dateTime.weekday(.wide).month(.abbreviated).day()).font(.caption2).foregroundStyle(.secondary)
          }
        }
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button { showDeepAnalysis = true } label: { Image(systemName: "sparkles") }
          .accessibilityLabel("Deep analysis")
        Button { showFeed = true } label: {
          Image(systemName: "newspaper")
            .overlay(alignment: .topTrailing) {
              if let n = feed?.unseenCount, n > 0 {
                Text(n > 9 ? "9+" : "\(n)").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                  .padding(.horizontal, 4).padding(.vertical, 1).background(Color.red, in: .capsule).offset(x: 8, y: -6)
              }
            }
        }
        .accessibilityLabel(feed.map { $0.unseenCount > 0 ? "Show latest news (\($0.unseenCount) new)" : "Show news" } ?? "Show news")
        WatchlistToggleButton(coinId: coinId, groupSlug: groupSlug)
      }
    }
    .sheet(isPresented: $showDeepAnalysis) { DeepAnalysisSheet(coinId: coinId) }
    .sheet(isPresented: $showFeed) {
      if let feed { MarketFeedSheet(store: feed, displayName: LogoOverrides.cleanTokenName(quote?.name ?? coinId)) }
    }
    .task(id: "\(coinId)|\(env.isSceneActive)|\(env.foregroundRevision)") {
      guard env.isSceneActive else { store?.stop(); feed?.stop(); return }
      let s = store ?? TokenChartStore(coinId: coinId, market: env.market, cache: env.queryCache, initialQuote: env.watchlistData.quote(coinId))
      store = s
      s.start(scale: scale)
      env.realtime.subscribe(coingeckoId: coinId, symbol: s.quote?.symbol)
      let f = feed ?? MarketFeedStore(coinId: coinId, news: env.news, canMutate: { [weak env] in env?.isReadyForUserData ?? false })
      feed = f
      f.start()
    }
    .onChange(of: scale) { _, next in store?.setScale(next) }
    .onChange(of: store?.quote?.symbol) { _, sym in
      if env.isSceneActive, let sym { env.realtime.unsubscribe(coingeckoId: coinId); env.realtime.subscribe(coingeckoId: coinId, symbol: sym) }
    }
    .onDisappear {
      store?.stop()
      feed?.stop()
      env.realtime.unsubscribe(coingeckoId: coinId)
    }
  }
}

/// Bookmark toggle for the active group (`watchlist-button.tsx`).
struct WatchlistToggleButton: View {
  let coinId: String
  let groupSlug: String?
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
        Image(systemName: inGroup ? "bookmark.fill" : "bookmark")
      }
      .disabled(pending)
      .accessibilityLabel(inGroup ? "Remove from \(group.name)" : "Add to \(group.name)")
    }
  }
}

