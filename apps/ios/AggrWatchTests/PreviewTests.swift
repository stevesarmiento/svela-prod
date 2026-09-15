#if DEBUG
import AggrAPI
import AggrCore
@testable import AggrLiveline
import Foundation
import Testing
import UIKit
@testable import AggrWatch

private actor OverviewRequestGate {
  private var opened = false
  private var waiters: [CheckedContinuation<Void, Never>] = []
  func wait() async {
    if opened { return }
    await withCheckedContinuation { waiters.append($0) }
  }
  func open() {
    opened = true
    for waiter in waiters { waiter.resume() }
    waiters = []
  }
}

@Test @MainActor func comparisonLivelinePreservesReturnsAndSwitchesHiddenPrimary() {
  let series: [MultiLineComparisonChart.Series] = [
    .init(id: "btc", label: "BTC", color: ChartColors.pastel[0], points: [.init(epochSeconds: 1, value: 0), .init(epochSeconds: 2, value: 10)]),
    .init(id: "eth", label: "ETH", color: ChartColors.pastel[1], points: [.init(epochSeconds: 1, value: 0), .init(epochSeconds: 2, value: -7)])
  ]
  let initial = MultiLineComparisonChart.input(series: series, hidden: [], pressed: nil, datasetID: "group", scale: .d7)
  let hidden = MultiLineComparisonChart.input(series: series, hidden: ["btc"], pressed: nil, datasetID: "group", scale: .d7)
  #expect(initial.primaryID == "btc")
  #expect(hidden.primaryID == "eth")
  #expect(hidden.viewport == initial.viewport)
  #expect(hidden.series[0].visible == false)
  #expect(hidden.series[1].points.last?.value == -7)
  let engine = LivelineEngine()
  var config = LivelineConfiguration(); config.reduceMotion = true; config.referenceValue = 0
  engine.update(initial, configuration: config, marketTime: 2)
  engine.advance(monotonicTime: 0, marketTime: 2)
  engine.update(hidden, configuration: config, marketTime: 2)
  // Hiding BTC must never briefly move ETH's tip to BTC's +10% value.
  #expect(engine.displayedValue == -7)
  #expect(engine.splines["eth"]?.points.last?.value == -7)
  #expect(engine.selection(at: 1.5)?.values["eth"] == -3.5)
  let empty = MultiLineComparisonChart.input(series: series, hidden: ["btc", "eth"], pressed: nil, datasetID: "group", scale: .d7)
  #expect(empty.state == .empty)
  let changedScale = MultiLineComparisonChart.input(series: series, hidden: [], pressed: nil, datasetID: "group", scale: .d1)
  #expect(changedScale.id != initial.id)
}

@Test @MainActor func settledCardChartsDoNotRestartRenderingDuringScroll() async throws {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
  let scroll = UIScrollView(frame: window.bounds)
  scroll.contentSize = CGSize(width: 390, height: 2000)
  window.addSubview(scroll)
  window.isHidden = false
  let chart = LivelineChartView(isDecorative: true)
  chart.frame = CGRect(x: 20, y: 200, width: 160, height: 16)
  scroll.addSubview(chart)
  window.layoutIfNeeded()
  scroll.layoutIfNeeded()
  chart.layoutIfNeeded()
  defer { chart.stop(); window.isHidden = true }
  var config = LivelineConfiguration.sparkline
  config.reduceMotion = true
  var input = LivelineInput(id: "card", series: [.init(id: "price", points: [
    .init(time: 1, value: 0), .init(time: 2, value: 3)
  ])], viewport: .historical(1...2))
  func apply(active: Bool = true) {
    chart.apply(input: input, configuration: config, isActive: active,
                formatValue: { String($0) }, formatVolume: { String($0) },
                formatTime: { String($0) }, onSelection: { _ in })
  }
  apply()
  for _ in 0..<200 {
    if !chart.hasActiveDisplayLink { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(!chart.hasActiveDisplayLink)
  let starts = chart.displayLinkStartCount
  #expect(starts > 0)
  #expect(chart.gestureRecognizers?.isEmpty != false)
  for offset in stride(from: 0, through: 100, by: 5) {
    scroll.contentOffset.y = CGFloat(offset)
    chart.setNeedsLayout()
    chart.layoutIfNeeded()
    apply()
    await Task.yield()
  }
  apply(active: false)
  apply()
  try await Task.sleep(for: .milliseconds(50))
  #expect(chart.displayLinkStartCount == starts)
  #expect(!chart.hasActiveDisplayLink)
  // New data must still wake the renderer; this is not a permanently frozen snapshot.
  input.series[0].points[1].value = -2
  apply()
  #expect(chart.displayLinkStartCount > starts)
  #expect(chart.hasActiveDisplayLink)
  #expect((LivelineChartView().gestureRecognizers?.count ?? 0) >= 2)
}

@Test @MainActor func globalMarketRequestMatchesWebCurrencyContract() async throws {
  // The old request must be rejected by the fixture, just as the real Zod route rejects it.
  #expect(PreviewFixtures.response(for: URL(string: "https://preview.invalid/api/coingecko/global-market-cap?days=1")!) == nil)
  let env = PreviewData.environment()
  for days in ["1", "7", "30", "365"] {
    let response = try await env.market.globalMarketCap(days: days)
    #expect(response.data.market_cap.count > 2)
  }
}

@Test @MainActor func watchlistChartFetchReportsLoadingWithCachedGroups() async throws {
  let env = PreviewData.environment()
  let store = env.watchlistData, cache = env.queryCache, market = env.market
  let cached = store.aggregate1dByGroup
  #expect(!cached.isEmpty)
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("market-chart", "bitcoin", "1"), policy: .aggregateChart) {
      await started.open()
      await release.wait()
      return try await market.marketChart(coinId: "bitcoin", days: "1")
    }
  }
  await started.wait()
  let refresh = Task { await store.refreshAggregates(force: false) }
  for _ in 0..<100 {
    if store.isAggregateLoading { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(store.isAggregateLoading)
  #expect(store.aggregate1dByGroup[PreviewFixtures.group.id] == cached[PreviewFixtures.group.id])
  await release.open()
  _ = try await pending.value
  await refresh.value
  #expect(!store.isAggregateLoading)
}

@Test @MainActor func watchlistCardsPublishIndependentlyAfterTheirOwnMembersFinish() async throws {
  let env = PreviewData.environment()
  let store = env.watchlistData, cache = env.queryCache, market = env.market
  store.seedPreview(loadCharts: false)
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("market-chart", "bitcoin", "1"), policy: .aggregateChart) {
      await started.open()
      await release.wait()
      return try await market.marketChart(coinId: "bitcoin", days: "1")
    }
  }
  await started.wait()
  let refresh = Task { await store.refreshAggregates(force: false) }
  for _ in 0..<200 {
    if (store.aggregate1dByGroup[PreviewFixtures.secondGroup.id]?.count ?? 0) >= 2 { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  // The Solana-only group finishes; the BTC/ETH/SOL group must not publish a
  // partial percentage. Solana is shared by both groups in the same fan-out.
  #expect((store.aggregate1dByGroup[PreviewFixtures.secondGroup.id]?.count ?? 0) >= 2)
  #expect(store.aggregate1dByGroup[PreviewFixtures.group.id] == nil)
  #expect(store.aggregatePendingGroupIDs == [PreviewFixtures.group.id])
  #expect(store.isAggregateLoading)
  let readyChart = store.aggregate1dByGroup[PreviewFixtures.secondGroup.id]
  await release.open()
  _ = try await pending.value
  await refresh.value
  #expect((store.aggregate1dByGroup[PreviewFixtures.group.id]?.count ?? 0) >= 2)
  #expect(store.aggregate1dByGroup[PreviewFixtures.secondGroup.id] == readyChart)
  #expect(store.aggregatePendingGroupIDs.isEmpty)
  #expect(!store.isAggregateLoading)
}

@Test @MainActor func failedWatchlistMemberKeepsCachedChartAndEndsLoading() async throws {
  let env = PreviewData.environment()
  let store = env.watchlistData, cache = env.queryCache
  let cached = store.aggregate1dByGroup[PreviewFixtures.group.id]
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("market-chart", "bitcoin", "1"), policy: .aggregateChart) { () async throws -> MarketChartResponse in
      await started.open()
      await release.wait()
      throw URLError(.timedOut)
    }
  }
  await started.wait()
  let refresh = Task { await store.refreshAggregates(force: false) }
  for _ in 0..<200 {
    if store.isAggregateLoading && store.aggregatePendingGroupIDs == [PreviewFixtures.group.id] { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(store.aggregatePendingGroupIDs == [PreviewFixtures.group.id])
  await release.open()
  _ = try? await pending.value
  await refresh.value
  #expect(store.aggregate1dByGroup[PreviewFixtures.group.id] == cached)
  #expect(store.aggregatePendingGroupIDs.isEmpty)
  #expect(!store.isAggregateLoading)
}

@Test @MainActor func pausedWatchlistRefreshCannotPublishLateResults() async throws {
  let env = PreviewData.environment()
  let store = env.watchlistData, cache = env.queryCache, market = env.market
  store.seedPreview(loadCharts: false)
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("market-chart", "bitcoin", "1"), policy: .aggregateChart) {
      await started.open()
      await release.wait()
      return try await market.marketChart(coinId: "bitcoin", days: "1")
    }
  }
  await started.wait()
  let refresh = Task { await store.refreshAggregates(force: false) }
  for _ in 0..<200 {
    if (store.aggregate1dByGroup[PreviewFixtures.secondGroup.id]?.count ?? 0) >= 2 { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(store.aggregatePendingGroupIDs == [PreviewFixtures.group.id])
  store.pause()
  let before = store.aggregate1dByGroup
  await release.open()
  _ = try await pending.value
  await refresh.value
  #expect(store.aggregate1dByGroup == before)
  #expect(store.aggregatePendingGroupIDs.isEmpty)
  #expect(!store.isAggregateLoading)
}

@Test @MainActor func overviewPublishesMarketWhilePortfolioRequestIsStillPending() async throws {
  let env = PreviewData.environment()
  let cache = env.queryCache, market = env.market
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("market-chart", "bitcoin", "1"), policy: .aggregateChart) {
      await started.open()
      await release.wait()
      return try await market.marketChart(coinId: "bitcoin", days: "1")
    }
  }
  await started.wait()
  let store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: market, cache: cache)
  store.start()
  defer { store.stop() }
  for _ in 0..<200 {
    if store.displayMarketCapUsd != nil && !store.marketLoading { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(store.displayMarketCapUsd != nil)
  #expect(!store.marketLoading)
  #expect(store.seriesLoading)
  #expect(store.valueSeries.isEmpty)
  await release.open()
  _ = try await pending.value
}

@Test @MainActor func overviewSurfacesMarketRequestFailure() async throws {
  let env = PreviewData.environment(state: .empty)
  let cache = env.queryCache
  let started = OverviewRequestGate(), release = OverviewRequestGate()
  let pending = Task {
    try await cache.fetch(QueryCache.Key("global-market-cap", "1"), policy: .globalMarketCap) { () async throws -> GlobalMarketCapResponse in
      await started.open()
      await release.wait()
      throw APIError.invalidParams(endpoint: "/api/coingecko/global-market-cap", message: "Invalid parameters")
    }
  }
  await started.wait()
  let store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: env.market, cache: cache)
  let loading = Task { await store.loadSeries(force: false) }
  // Let the store join the in-flight request before releasing the controlled failure.
  try await Task.sleep(for: .milliseconds(50))
  await release.open()
  _ = try? await pending.value
  await loading.value
  #expect(store.marketError == "Invalid parameters")
  #expect(!store.marketLoading)
  #expect(store.marketSeries.isEmpty)
}

@Test @MainActor func overviewLivelinePreservesBothRebasedSeries() {
  let portfolio = [TimePoint(epochSeconds: 100, value: 100), TimePoint(epochSeconds: 200, value: 110)]
  let market = [TimePoint(epochSeconds: 100, value: 100), TimePoint(epochSeconds: 200, value: 95)]
  let input = RebasedComparisonChart.input(portfolio: portfolio, market: market, scale: .d1)
  #expect(input.primaryID == "portfolio")
  #expect(input.series.map(\.id) == ["portfolio", "market"])
  #expect(input.series[1].points.last?.value == 95)
  #expect(input.volume.isEmpty && input.observation == nil && input.band == nil)
  let marketOnly = RebasedComparisonChart.input(portfolio: [], market: market, scale: .d7)
  #expect(marketOnly.primaryID == "market")
  #expect(marketOnly.id != input.id)
}

@Test @MainActor func overviewLoadsMarketWithoutHoldingsAndClearsScrubOnRangeChange() async throws {
  let env = PreviewData.environment(state: .empty)
  let store = OverviewStore(repo: env.overview, watchlistData: env.watchlistData, market: env.market, cache: env.queryCache)
  store.start()
  defer { store.stop() }
  for _ in 0..<200 {
    if store.hasLoaded && !store.marketSeries.isEmpty { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(store.hasLoaded)
  #expect(!store.hasHoldings)
  #expect(store.marketSeries.count > 2)
  #expect(store.marketChartPoints.first?.value == 100)
  #expect((store.displayMarketCapUsd ?? 0) > 1_000_000_000)
  let first = try #require(store.marketSeries.first)
  store.scrubTime = first.epochSeconds
  #expect(store.displayMarketCapUsd == first.value)
  store.scale = .d7
  #expect(store.scrubTime == nil)
  #expect(store.marketSeries.isEmpty)
  for _ in 0..<200 {
    if !store.marketLoading && !store.marketChartPoints.isEmpty { break }
    try await Task.sleep(for: .milliseconds(10))
  }
  #expect(!store.marketChartPoints.isEmpty)
}

@Test @MainActor func defaultWatchlistSortUsesCreationDateRatherThanDefaultFlagOrUpdateDate() {
  let groups = [
    WatchlistGroup(id: "new", creationTime: 300, name: "Default", slug: "new", isDefault: true, createdAt: 300),
    WatchlistGroup(id: "unknown", name: "Unknown", slug: "unknown"),
    WatchlistGroup(id: "old", creationTime: 200, name: "Old", slug: "old", createdAt: 100, updatedAt: 900),
    WatchlistGroup(id: "fallback", creationTime: 150, name: "Legacy", slug: "fallback"),
    WatchlistGroup(id: "tie", name: "Same date", slug: "tie", createdAt: 100)
  ]
  let sorted = WatchlistCardSort.original.ordered(groups, change: { _ in nil }, tokenCount: { _ in 0 })
  #expect(sorted.map(\.id) == ["old", "tie", "fallback", "new", "unknown"])
}

@Test @MainActor func watchlistSortHandlesMissingPricesAndStableTies() {
  let groups = ["missing", "gain", "loss", "tie", "invalid"].map {
    WatchlistGroup(id: $0, userId: "test", name: $0, slug: $0)
  }
  let changes: [String: Double] = ["gain": 8, "loss": -3, "tie": 8, "invalid": .nan]
  func ids(_ sort: WatchlistCardSort) -> [String] {
    sort.ordered(groups, change: { changes[$0.id] }, tokenCount: { _ in 0 }).map(\.id)
  }
  #expect(ids(.changeDescending) == ["gain", "tie", "loss", "missing", "invalid"])
  #expect(ids(.changeAscending) == ["loss", "gain", "tie", "missing", "invalid"])
  #expect(ids(.original) == groups.map(\.id))
}

@Test @MainActor func watchlistSortOrdersNamesAndTokenCounts() {
  let groups = ["Zebra", "alpha", "Beta"].map {
    WatchlistGroup(id: $0, userId: "test", name: $0, slug: $0)
  }
  let counts = ["Zebra": 3, "alpha": 0, "Beta": 1]
  func ids(_ sort: WatchlistCardSort) -> [String] {
    sort.ordered(groups, change: { _ in nil }, tokenCount: { counts[$0.id]! }).map(\.id)
  }
  #expect(ids(.nameAscending) == ["alpha", "Beta", "Zebra"])
  #expect(ids(.nameDescending) == ["Zebra", "Beta", "alpha"])
  #expect(ids(.mostTokens) == ["Zebra", "Beta", "alpha"])
  #expect(ids(.fewestTokens) == ["alpha", "Beta", "Zebra"])
}

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
@Test @MainActor func analysisRetainsRealDataForSidebarAndComparison() async throws {
  let env = PreviewData.environment()
  let btc = try await env.analysis.build(coinId: "bitcoin")
  let eth = try await env.analysis.build(coinId: "ethereum")
  #expect(btc.data.symbolId == "bitcoin")
  #expect(eth.data.symbol.uppercased() == "ETH")
  #expect(btc.series.count >= 30 && btc.volume.count >= 30)
  #expect(btc.data.bollingerBands != nil)
  #expect(btc.data.marketVision?.waveTrend != nil)
  #expect(btc.data.orderFlow == nil) // Preview's unavailable derivatives must never become 50% buy.
  #expect(btc.data.liquidationData == nil)
  let price = try await env.analysis.priceChart(coinId: "bitcoin")
  #expect(!price.line.isEmpty && !price.volume.isEmpty)
  #expect(!HullSuite.compute(price.ohlc).mhull.isEmpty)
  let stats = ComparativeStats.compute([btc.comparativeInput, eth.comparativeInput])!
  #expect(stats.tokens.count == 2)
  #expect(stats.benchmarkId == "bitcoin")
  #expect(stats.tokens[1].bbPercentB != nil)
  #expect(stats.correlationMatrix.count == 2)
  let lines = AnalysisChartSeries.normalized([.init(id: "bitcoin", symbol: "BTC", points: btc.series),
                                             .init(id: "ethereum", symbol: "ETH", points: eth.series)])
  #expect(lines.count == 2)
  #expect(lines[0].points.map(\.epochSeconds) == lines[1].points.map(\.epochSeconds))
}

#endif
