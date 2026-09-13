#if DEBUG
import AggrAPI
import AggrCore
import AggrLiveline
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

@Test @MainActor func minimalPriceInputHasNoForecastOrVolume() {
  let env = PreviewData.environment()
  let store = PreviewData.tokenStore(env)
  let input = AggrPriceChart.input(coinId: "bitcoin", data: store.data, hull: store.hull, projection: store.projection,
                                  scale: .d1, liveObservation: nil, showPrice: true, showMarketCap: true,
                                  isLoading: false, hasObservedHistory: true, simplified: true)
  #expect(input.series.map(\.id) == ["price", "marketCap", "mhull", "shull"])
  for series in input.series {
    #expect(!series.points.isEmpty)
    #expect(series.points.allSatisfy { $0.value.isFinite })
  }
  let cap = input.series.first { $0.id == "marketCap" }!
  #expect(cap.visible && cap.multiplier > 0 && cap.multiplier < 1)
  #expect(input.volume.isEmpty)
  #expect(input.band == nil)
  #expect(input.projectionID == nil)
  if case .historical(let range) = input.viewport {
    #expect(range.upperBound - range.lowerBound <= 86_400)
    #expect(range.upperBound == Double(store.data.line.last!.epochSeconds))
    #expect(input.series.allSatisfy { $0.points.allSatisfy { range.contains($0.time) } })
  } else { Issue.record("Expected a historical price window") }
}

@Test @MainActor func tokenPriceWindowUsesVisiblePeriodAndInterpolatesBoundary() {
  let day = 86_400
  let history: [TimePoint] = [
    .init(epochSeconds: 0, value: 50),
    .init(epochSeconds: day, value: 100),
    .init(epochSeconds: day * 3, value: 200)
  ]
  let window = TokenPriceWindow(history: history, scale: .d1)
  #expect(window.points.first?.epochSeconds == day * 2)
  #expect(window.points.first?.value == 150)
  #expect(!window.isPartial)
  #expect(abs(window.percentChange(to: 180)! - 20) < 0.0001)
  #expect(window.percentChange(to: nil) == nil)
  #expect(window.dollarChange(to: 180) == 30)
  #expect(window.dollarChange(to: 120) == -30)
  #expect(window.dollarChange(to: nil) == nil)
  #expect(history.first?.epochSeconds == 0)
  let month = TokenPriceWindow(history: history, scale: .d30)
  #expect(month.isPartial)
  #expect(month.periodLabel(scale: .d30) == "Available history")
  #expect(TokenPriceWindow(history: [], scale: .d1).percentChange(to: 200) == nil)
  let sampledDay = TokenPriceWindow(history: [.init(epochSeconds: 300, value: 100), .init(epochSeconds: 3600, value: 110),
                                              .init(epochSeconds: day, value: 120)], scale: .d1)
  #expect(!sampledDay.isPartial)
  #expect(sampledDay.periodLabel(scale: .d1) == "Past day")
}
#endif
