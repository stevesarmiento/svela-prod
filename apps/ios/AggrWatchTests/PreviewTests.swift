#if DEBUG
import AggrAPI
import AggrCore
import Foundation
import Testing
@testable import AggrWatch

@Test @MainActor func previewSubscriptionsDecodeAndMatchWatchlists() async throws {
  let env = PreviewData.environment()
  #expect(env.convex.isPreview)
  #expect(env.isReadyForUserData)
  #expect(env.clerkSession.user?.primaryEmailAddress?.emailAddress == "alex@example.com")
  for try await bootstrap in env.watchlists.pageBootstrap() {
    #expect(bootstrap.groups.count == 2)
    #expect(bootstrap.allCoinIds.count == 3)
  }
  for try await overview in env.overview.bootstrap() {
    #expect(overview.isFresh)
    #expect(overview.holdingsBreakdown.first?.positions.count == 3)
    #expect(overview.events?.events.count == 1)
  }
  for try await articles in env.news.articles(coinId: "bitcoin", limit: 10) {
    #expect(articles.count == 2)
  }
}

@Test @MainActor func previewMarketTransportFeedsRealStores() async throws {
  let env = PreviewData.environment()
  let quotes = try await env.market.quotes(ids: ["bitcoin"], sparkline: true)
  #expect(quotes.data["bitcoin"]?.currentPrice == 67_420)
  let chart = try await env.market.marketChart(coinId: "bitcoin", days: "30")
  #expect(chart.data.prices.count == 400)
  let global = try await env.market.globalMarketCap(days: "30")
  #expect(global.data.market_cap.count == 400)
  let ohlc = try await env.market.ohlc(coinId: "bitcoin", days: "30")
  #expect(ohlc.data.count == 400)
  let rows = try await env.market.topMarkets()
  #expect(rows.count == 3)
  let search = try await env.market.searchCoins(query: "eth")
  #expect(search.map(\.coingeckoId) == ["ethereum"])
  let meta = try await env.market.coinMeta(id: "bitcoin")
  #expect(meta?.symbol == "BTC")
  let store = TokenChartStore(coinId: "bitcoin", market: env.market, cache: env.queryCache, initialQuote: nil)
  await store.refreshQuote()
  await store.load(force: true)
  #expect(store.error == nil)
  #expect(store.data.line.count > 2)
  let now = Int(Date.now.timeIntervalSince1970)
  #expect(store.data.line.allSatisfy { (now - 30 * 86_400...now + 86_400).contains($0.epochSeconds) })
  #expect(store.data.marketCap.allSatisfy { (now - 30 * 86_400...now + 86_400).contains($0.epochSeconds) })
  #expect(!store.isLoading)
  store.stop()
}

@Test @MainActor func previewsBlockWritesAuthenticationAndLivePrices() async {
  let env = PreviewData.environment()
  await #expect(throws: ConvexServiceError.self) { try await env.watchlists.remove(coinId: "bitcoin", groupId: PreviewFixtures.group.id) }
  await #expect(throws: APIError.self) {
    let _: Data = try await env.apiClient.get("/unhandled-preview-endpoint", requiresAuth: false)
  }
  await env.clerkSession.signInWithGoogle()
  #expect(env.clerkSession.lastError != nil)
  #expect(env.clerkSession.user?.id == "preview-user")
  env.realtime.subscribe(coingeckoId: "bitcoin", symbol: "BTC")
  #expect(env.realtime.status("bitcoin") == .disabled)
  #expect(env.realtime.spot("bitcoin") == nil)
}

@Test @MainActor func previewEmptyAndSignedOutStatesAreIndependent() async throws {
  let empty = PreviewData.environment(state: .empty)
  for try await bootstrap in empty.watchlists.pageBootstrap() { #expect(bootstrap.groups.isEmpty) }
  for try await overview in empty.overview.bootstrap() { #expect(overview.watchlistCoinCount == 0) }
  let signedOut = PreviewData.environment(signedIn: false)
  #expect(signedOut.clerkSession.isLoaded)
  #expect(!signedOut.clerkSession.isSignedIn)
  #expect(!signedOut.isReadyForUserData)
  let populated = PreviewData.environment()
  #expect(populated.watchlistData.groups.count == 2)
  #expect(populated.selection !== empty.selection)
}

@Test @MainActor func previewChartAndOverviewFixturesHaveUsableContent() {
  let env = PreviewData.environment()
  let token = PreviewData.tokenStore(env)
  #expect(token.indicators != nil)
  #expect(!token.hull.mhull.isEmpty)
  #expect(token.projection != nil)
  #expect(token.indicators?.bbwp.bbwp.lastFinite != nil)
  let overview = PreviewData.overviewStore(env)
  #expect(overview.hasLoaded)
  #expect(overview.totalValueUsd != nil)
  #expect(overview.portfolioChartPoints.count > 2)
  #expect(overview.breadth?.total == 3)
}
#endif
