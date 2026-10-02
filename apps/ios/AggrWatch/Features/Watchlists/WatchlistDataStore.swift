import AggrAPI
import AggrCore
import Foundation
import Observation

/// Shared user-data store: Convex page bootstrap (groups + items + holdings), bulk quotes (30s stale / 5m poll),
/// and per-group 1D equal-weight aggregate series (market-chart fan-out, concurrency 5, 5m poll).
/// Mirrors `watchlist-context.tsx`, `use-coingecko-quotes.ts`, `use-coingecko-watchlist-aggregate-chart-isolated.ts`.
///
/// Every observable write is guarded by equality: Convex re-sends full results and the quotes poll
/// re-delivers unchanged payloads, and `@Observable` would otherwise invalidate every reader each time.
@Observable
final class WatchlistDataStore {
  private(set) var bootstrap: WatchlistsPageBootstrap = .empty
  private(set) var hasLoadedBootstrap = false
  private(set) var bootstrapError: String?

  /// Bulk snapshot for readers that need every quote at once; written only when the set changes.
  private(set) var quotesById: [String: CoinQuote] = [:]
  /// Per-token box: a row reading `quote(_:)` tracks only its own coin, not the whole dictionary.
  @Observable final class QuoteBox {
    var quote: CoinQuote?
    init(_ quote: CoinQuote?) { self.quote = quote }
  }
  @ObservationIgnored private var boxes: [String: QuoteBox] = [:]
  /// Untracked mirror of `quotesById` so creating a box inside a view body subscribes to nothing.
  @ObservationIgnored private var quotesSnapshot: [String: CoinQuote] = [:]
  private(set) var isQuotesLoading = false
  private(set) var quotesError: String?
  private(set) var quotesUpdatedAt: Date?
  /// Bumps whenever the published quote set changes, including a stale-while-revalidate paint.
  private(set) var quotesRevision = 0

  /// 1D equal-weight return series per group id (for card sparklines / agg %).
  private(set) var aggregate1dByGroup: [String: [TimePoint]] = [:]
  private(set) var isAggregateLoading = false
  private(set) var aggregatePendingGroupIDs: Set<String> = []

  /// `wg` — selected group slug (persisted like the URL param).
  var selectedGroupSlug: String? {
    didSet { UserDefaults.standard.set(selectedGroupSlug, forKey: "watchlists.wg") }
  }

  private let repository: WatchlistRepository
  private let market: MarketAPI
  private let cache: QueryCache
  private var bootstrapTask: Task<Void, Never>?
  private var quotesPollTask: Task<Void, Never>?
  private var aggregateTask: Task<Void, Never>?
  private var lastCoinIdsKey = ""
  private var lastMembershipKey = ""
  private var quotesRefreshTask: Task<Void, Never>?
  private var subscriptionGeneration = 0
  private var aggregateRequestID = UUID()

  init(repository: WatchlistRepository, market: MarketAPI, cache: QueryCache) {
    self.repository = repository
    self.market = market
    self.cache = cache
    self.selectedGroupSlug = UserDefaults.standard.string(forKey: "watchlists.wg")
  }

  // MARK: Derived

  var groups: [WatchlistGroup] { bootstrap.groups }

  /// `useSelectedGroupState`: explicit slug if it exists, else default, else first.
  var selectedGroup: WatchlistGroup? {
    if let slug = selectedGroupSlug, let g = groups.first(where: { $0.slug == slug }) { return g }
    return bootstrap.defaultGroup ?? groups.first
  }

  func items(in group: WatchlistGroup) -> [WatchlistItem] {
    bootstrap.itemsByGroupId[group.id] ?? []
  }

  func coinIds(in group: WatchlistGroup) -> [String] {
    items(in: group).map(\.coinId)
  }

  func quote(_ coinId: String) -> CoinQuote? { box(coinId).quote }

  private func box(_ coinId: String) -> QuoteBox {
    if let existing = boxes[coinId] { return existing }
    let created = QuoteBox(quotesSnapshot[coinId])
    boxes[coinId] = created
    return created
  }

  /// Replaces the bulk snapshot and pushes only changed values into the per-token boxes.
  private func publishQuotes(_ next: [String: CoinQuote]) {
    quotesSnapshot = next
    if quotesById != next { quotesById = next; quotesRevision &+= 1 }
    for (id, box) in boxes {
      let quote = next[id]
      if box.quote != quote { box.quote = quote }
    }
  }

  private func setQuotesLoading(_ loading: Bool) {
    if isQuotesLoading != loading { isQuotesLoading = loading }
  }

  func isInAnyWatchlist(_ coinId: String) -> Bool {
    bootstrap.itemsByGroupId.values.contains { $0.contains { $0.coinId == coinId } }
  }

  func isInGroup(_ coinId: String, groupId: String) -> Bool {
    bootstrap.itemsByGroupId[groupId]?.contains { $0.coinId == coinId } ?? false
  }

  /// Latest 1D aggregate change for a group; falls back to a quote-based equal-weight estimate.
  func aggregateChange1d(for group: WatchlistGroup) -> (value: Double, isEstimate: Bool)? {
    if let last = aggregate1dByGroup[group.id]?.last { return (last.value, false) }
    let pcts = coinIds(in: group).map { quote($0)?.priceChangePercentage24h }
    guard let est = AggregateSeries.equalWeightFromQuotes(pcts) else { return nil }
    return (est, true)
  }

  // MARK: Lifecycle

  func start() {
    guard bootstrapTask == nil else { return }
    subscriptionGeneration += 1
    let generation = subscriptionGeneration
    bootstrapError = nil
    bootstrapTask = Task { [weak self] in
      guard let self else { return }
      defer { if self.subscriptionGeneration == generation { self.bootstrapTask = nil } }
      do {
        for try await next in repository.pageBootstrap() {
          guard !Task.isCancelled, self.subscriptionGeneration == generation else { return }
          // Convex re-sends the full page on any change (including holdings edits).
          if next != self.bootstrap { self.bootstrap = next }
          if !self.hasLoadedBootstrap { self.hasLoadedBootstrap = true }
          if self.bootstrapError != nil { self.bootstrapError = nil }
          self.reconcileSelection()
          self.onCoinSetChanged()
        }
      } catch is CancellationError {
      } catch {
        if !Task.isCancelled, self.subscriptionGeneration == generation { self.bootstrapError = error.localizedDescription }
      }
    }
    startQuotesPolling()
  }

  func pause() {
    subscriptionGeneration += 1
    bootstrapTask?.cancel(); bootstrapTask = nil
    quotesPollTask?.cancel(); quotesPollTask = nil
    aggregateTask?.cancel(); aggregateTask = nil
    quotesRefreshTask?.cancel(); quotesRefreshTask = nil
    setQuotesLoading(false)
    if isAggregateLoading { isAggregateLoading = false }
    if !aggregatePendingGroupIDs.isEmpty { aggregatePendingGroupIDs = [] }
  }

  func stop() {
    pause()
    if bootstrap != .empty { bootstrap = .empty }
    if hasLoadedBootstrap { hasLoadedBootstrap = false }
    publishQuotes([:])
    if !aggregate1dByGroup.isEmpty { aggregate1dByGroup = [:] }
    lastCoinIdsKey = ""; lastMembershipKey = ""
    if bootstrapError != nil { bootstrapError = nil }
    if quotesError != nil { quotesError = nil }
    if quotesUpdatedAt != nil { quotesUpdatedAt = nil }
  }

  func refreshOnForeground() async {
    start()
    await refreshQuotes(force: false)
    await refreshAggregates(force: false)
  }

  private func reconcileSelection() {
    guard !groups.isEmpty else { return }
    if let slug = selectedGroupSlug, groups.contains(where: { $0.slug == slug }) { return }
    selectedGroupSlug = (bootstrap.defaultGroup ?? groups.first)?.slug
  }

  private func onCoinSetChanged() {
    let key = bootstrap.allCoinIds.sorted().joined(separator: ",")
    if key != lastCoinIdsKey {
      lastCoinIdsKey = key
      quotesRefreshTask?.cancel()
      quotesRefreshTask = Task { await refreshQuotes(force: false) }
    }
    if bootstrap.membershipKey != lastMembershipKey {
      lastMembershipKey = bootstrap.membershipKey
      aggregateTask?.cancel()
      aggregateTask = Task { await refreshAggregates(force: false) }
    }
  }

  // MARK: Quotes

  private func startQuotesPolling() {
    quotesPollTask?.cancel()
    quotesPollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: QueryPolicy.quotes.refetchInterval ?? .seconds(300))
        guard let self, !Task.isCancelled else { return }
        await refreshQuotes(force: true)
        await refreshAggregates(force: false)
      }
    }
  }

  func refreshQuotes(force: Bool) async {
    let ids = bootstrap.allCoinIds
    guard !ids.isEmpty else { publishQuotes([:]); return }
    let coldStart = quotesSnapshot.isEmpty
    setQuotesLoading(coldStart)
    defer { setQuotesLoading(false) }
    let generation = subscriptionGeneration
    do {
      if coldStart {
        // Paint the last cached snapshot (stale-while-revalidate) before the network round trip;
        // the revalidation flight it starts is joined by the fetch below.
        if let stale = try? await fetchQuotes(ids: ids, force: false, staleWhileRevalidate: true), !stale.isEmpty {
          guard !Task.isCancelled, generation == subscriptionGeneration else { return }
          mergeQuotes(stale)
          setQuotesLoading(false)
        }
      }
      let merged = try await fetchQuotes(ids: ids, force: force)
      guard !Task.isCancelled, generation == subscriptionGeneration else { return }
      mergeQuotes(merged)
      quotesUpdatedAt = Date()
      if quotesError != nil { quotesError = nil }
    } catch is CancellationError {
    } catch {
      if quotesError != error.localizedDescription { quotesError = error.localizedDescription }
    }
  }

  /// Newest-wins merge (`shouldSyncQuote`): keep existing entries the new payload lacks.
  private func mergeQuotes(_ incoming: [String: CoinQuote]) {
    var next = quotesSnapshot
    for (id, q) in incoming { next[id] = q }
    publishQuotes(next)
  }

  nonisolated static func quoteKey(_ id: String) -> QueryCache.Key { QueryCache.Key("coingecko-quote", id) }

  /// Bulk quotes without sparklines (nothing reads `sparkline7d`; it bloats the payload and defeats
  /// `CoinQuote` equality), chunked to stay under upstream page limits. Ids with a fresh per-id entry
  /// are served from cache so a membership change only requests what is missing or stale; every
  /// bulk response seeds the per-id entries the token page reads (`("coingecko-quote", id)` as a
  /// single-coin `CoinQuotesResponse`, the type `TokenChartStore.refreshQuote` fetches).
  func fetchQuotes(ids: [String], force: Bool, staleWhileRevalidate: Bool = false) async throws -> [String: CoinQuote] {
    let sorted = Array(Set(ids)).sorted()
    var out: [String: CoinQuote] = [:]
    var missing = sorted
    if !force, !staleWhileRevalidate {
      let fresh: [QueryCache.Key: CoinQuotesResponse] = await cache.peekFresh(sorted.map(Self.quoteKey), policy: .quotes)
      if !fresh.isEmpty {
        missing = []
        for id in sorted {
          if let q = fresh[Self.quoteKey(id)]?.data[id] { out[id] = q } else { missing.append(id) }
        }
      }
    }
    guard !missing.isEmpty else { return out }
    let requested = missing
    let key = QueryCache.Key("coingecko-quotes", requested.joined(separator: ","))
    let market = self.market
    let cache = self.cache
    let fetched = try await cache.fetch(key, policy: .quotes, force: force, staleWhileRevalidate: staleWhileRevalidate) {
      var out: [String: CoinQuote] = [:]
      for chunk in requested.chunked(into: 150) {
        let response = try await market.quotes(ids: chunk, sparkline: false)
        out.merge(response.data) { _, new in new }
      }
      await cache.set(Dictionary(uniqueKeysWithValues: out.map { (Self.quoteKey($0.key), CoinQuotesResponse(data: [$0.key: $0.value])) }), policy: .quotes)
      return out
    }
    out.merge(fetched) { _, new in new }
    return out
  }

  // MARK: Aggregates (1D)

  func refreshAggregates(force: Bool) async {
    let generation = subscriptionGeneration
    let requestID = UUID()
    aggregateRequestID = requestID
    let membership = bootstrap.membershipKey
    let byGroup = groups.map { ($0.id, coinIds(in: $0)) }
    // Preserve group order while fetching shared tokens only once.
    var seen = Set<String>()
    let allIds = byGroup.flatMap(\.1).filter { seen.insert($0).inserted }
    var pending = Dictionary(uniqueKeysWithValues: byGroup.map { ($0.0, Set($0.1)) })
    // Only cards without a usable series show a loading treatment (ready cards keep their chart),
    // so a routine poll over cached groups publishes nothing here.
    let needsSeries = Set(byGroup.filter { !$0.1.isEmpty && (aggregate1dByGroup[$0.0]?.count ?? 0) < 2 }.map(\.0))
    if aggregatePendingGroupIDs != needsSeries { aggregatePendingGroupIDs = needsSeries }
    if isAggregateLoading != !allIds.isEmpty { isAggregateLoading = !allIds.isEmpty }
    let retained = aggregate1dByGroup.filter { !(pending[$0.key]?.isEmpty ?? true) }
    if retained.count != aggregate1dByGroup.count { aggregate1dByGroup = retained }
    guard !allIds.isEmpty else { return }
    // Fetching and having cached data are independent. Individual cards decide
    // whether they need a loading treatment, while ready cards retain their chart.
    defer {
      if generation == subscriptionGeneration, requestID == aggregateRequestID {
        if isAggregateLoading { isAggregateLoading = false }
        if !aggregatePendingGroupIDs.isEmpty { aggregatePendingGroupIDs = [] }
      }
    }
    let end = TimeScale.d1.rangeEndMs()
    var received: [String: ChartSeries] = [:]
    var failed = Set<String>()
    _ = await Self.fetchMarketChartSeries(ids: allIds, days: "1", market: market, cache: cache, force: force) { [self] id, series in
      guard !Task.isCancelled, generation == subscriptionGeneration, requestID == aggregateRequestID,
            membership == bootstrap.membershipKey else { return }
      if let series { received[id] = series } else { failed.insert(id) }
      for (groupId, ids) in byGroup where pending[groupId]?.contains(id) == true {
        pending[groupId]?.remove(id)
        guard pending[groupId]?.isEmpty == true else { continue }
        // Wait for every member to settle so the percentage never represents a
        // temporarily incomplete set. Other groups need not wait for this one.
        if aggregatePendingGroupIDs.contains(groupId) { aggregatePendingGroupIDs.remove(groupId) }
        let cached = aggregate1dByGroup[groupId] ?? []
        if !failed.isDisjoint(with: ids), cached.count >= 2 { continue }
        var byCoin: [String: [TimePoint]] = [:]
        var warming = Set<String>()
        for coinId in ids {
          if let s = received[coinId] {
            byCoin[coinId] = s.points
            if s.warming { warming.insert(coinId) }
          }
        }
        let updated = AggregateSeries.equalWeightReturnSeries(.init(byCoin: byCoin, warming: warming), scale: .d1, rangeEndMs: end)
        if updated.count >= 2 || cached.isEmpty, updated != cached { aggregate1dByGroup[groupId] = updated }
      }
    }
  }

  struct ChartSeries: Sendable { var points: [TimePoint]; var warming: Bool }

  /// Shared market-chart entry: the token page, Compare, Overview and the watchlist aggregates all
  /// read `("market-chart", id, days)`, so a batch fetch here pre-warms every other surface.
  nonisolated static func chartKey(_ id: String, days: String) -> QueryCache.Key { .init("market-chart", id, days) }

  /// Batch responses are cached only long enough to dedupe simultaneous callers (Compare and the
  /// watchlist grid starting together); the durable entries are the per-coin ones seeded from them.
  private static let batchPolicy = QueryPolicy(staleTime: .seconds(300), gcTime: .seconds(300))

  /// Loads one series per coin, serving fresh per-coin cache entries (and 1M from the cached
  /// 90-day token-page request) without a request, then fetching the rest in batches of
  /// `MarketAPI.marketChartBatchLimit` — one round trip per chunk instead of one per coin. Each
  /// batched coin is seeded into the per-coin cache. If the batch route is unavailable the chunk
  /// falls back to per-coin requests (concurrency 5). Failures are swallowed to nil like the web.
  static func fetchMarketChartSeries(ids: [String], days: String, market: MarketAPI, cache: QueryCache, force: Bool,
                                     onResult: ((String, ChartSeries?) async -> Void)? = nil) async -> [String: ChartSeries] {
    var result: [String: ChartSeries] = [:]
    var missing: [String] = []
    if force {
      missing = ids
    } else {
      let fresh: [QueryCache.Key: MarketChartResponse] = await cache.peekFresh(ids.map { chartKey($0, days: days) }, policy: .aggregateChart)
      for id in ids {
        var response = fresh[chartKey(id, days: days)]
        if response == nil { response = await Self.supersetResponse(id: id, days: days, cache: cache) }
        if let response {
          let series = Self.series(from: response)
          result[id] = series
          await onResult?(id, series)
        } else {
          missing.append(id)
        }
      }
    }
    guard !missing.isEmpty else { return result }
    // A coin the token page is already fetching joins that flight rather than riding the batch.
    var joining: [String] = [], toBatch: [String] = []
    for id in missing {
      if await cache.isInFlight(chartKey(id, days: days)) { joining.append(id) } else { toBatch.append(id) }
    }
    // Every coin is delivered the moment it lands (cards finish independently): batch chunks are
    // one child task each, single coins are one child task each, and a chunk whose batch request
    // fails hands its ids back to be re-enqueued as single-coin tasks.
    await withTaskGroup(of: ChunkOutcome.self) { group in
      func enqueueSingle(_ id: String, force: Bool, _ group: inout TaskGroup<ChunkOutcome>) {
        group.addTask { .results([(id, await Self.fetchOne(id, days: days, market: market, cache: cache, force: force))]) }
      }
      var chunks = toBatch.chunked(into: MarketAPI.marketChartBatchLimit).makeIterator()
      var running = 0
      // Two chunks in flight: a 100-coin watchlist is two requests, not a burst.
      while running < 2, let chunk = chunks.next() {
        group.addTask { await Self.fetchChunk(chunk, days: days, market: market, cache: cache, force: force) }
        running += 1
      }
      for id in joining { enqueueSingle(id, force: false, &group) }
      for await outcome in group {
        guard !Task.isCancelled else { group.cancelAll(); break }
        switch outcome {
        case .results(let pairs):
          for (id, series) in pairs {
            if let series { result[id] = series }
            await onResult?(id, series)
          }
        case .fallback(let ids):
          // Route missing (older server) or a whole-batch failure: per-coin requests still work,
          // bounded by the market request budget.
          for id in ids { enqueueSingle(id, force: force, &group) }
          continue
        }
        if let next = chunks.next() {
          group.addTask { await Self.fetchChunk(next, days: days, market: market, cache: cache, force: force) }
        }
      }
    }
    return result
  }

  private enum ChunkOutcome: Sendable {
    case results([(String, ChartSeries?)])
    case fallback([String])
  }

  nonisolated private static func series(from response: MarketChartResponse) -> ChartSeries {
    let pts = response.data.prices.map { TimePoint(epochSeconds: TimePoint.normalizeEpochSeconds($0.time), value: $0.value) }
    return ChartSeries(points: pts, warming: response.status?.needsWarmup ?? false)
  }

  /// A fresh 90-day entry (the token page's 1M request) answers a 30-day request by clipping.
  private static func supersetResponse(id: String, days: String, cache: QueryCache) async -> MarketChartResponse? {
    guard days == TimeScale.d30.marketChartDaysParam else { return nil }
    let ninety: MarketChartResponse? = await cache.peek(chartKey(id, days: TimeScale.d30.tokenChartDaysParam), policy: .aggregateChart)
    guard let ninety, ninety.data.prices.count >= 2 else { return nil }
    let clipped = ninety.clipped(toLastDays: TimeScale.d30.rangeDays)
    guard clipped.data.prices.count >= 2 else { return nil }
    return clipped
  }

  private static func fetchChunk(_ chunk: [String], days: String, market: MarketAPI, cache: QueryCache, force: Bool) async -> ChunkOutcome {
    let key = QueryCache.Key("market-chart-batch", days, chunk.joined(separator: ","))
    do {
      let batch = try await cache.fetch(key, policy: batchPolicy, force: force) { try await market.marketCharts(ids: chunk, days: days) }
      await cache.set(Dictionary(uniqueKeysWithValues: batch.results.map { (chartKey($0.key, days: days), $0.value) }), policy: .aggregateChart)
      return .results(chunk.map { id in (id, batch.results[id].map(Self.series(from:))) })
    } catch is CancellationError {
      return .results(chunk.map { ($0, nil) })
    } catch {
      return .fallback(chunk)
    }
  }

  private static func fetchOne(_ id: String, days: String, market: MarketAPI, cache: QueryCache, force: Bool) async -> ChartSeries? {
    do {
      let response = try await cache.fetch(chartKey(id, days: days), policy: .aggregateChart, force: force) {
        try await market.marketChart(coinId: id, days: days)
      }
      return Self.series(from: response)
    } catch {
      return nil
    }
  }

  // MARK: Mutations (toast semantics from create-watchlist.tsx / watchlists-grid.tsx / chart-table.tsx)

  func createGroup(name: String, icon: String, color: String) async throws -> String {
    let id = try await repository.createGroup(name: name, icon: icon, color: color)
    return id
  }

  func updateGroup(_ group: WatchlistGroup, name: String, icon: String, color: String) async throws {
    try await repository.updateGroup(id: group.id, name: name, icon: icon, color: color)
  }

  func deleteGroup(_ group: WatchlistGroup) async throws {
    try await repository.deleteGroup(id: group.id)
    if selectedGroupSlug == group.slug { selectedGroupSlug = nil }
  }

  func add(coinId: String, to groupId: String?) async throws {
    _ = try await repository.add(coinId: coinId, groupId: groupId)
  }

  func remove(coinId: String, from groupId: String?) async throws {
    try await repository.remove(coinId: coinId, groupId: groupId)
  }

  func removeBulk(coinIds: [String], from groupId: String?) async throws -> Int {
    try await repository.removeBulk(coinIds: coinIds, groupId: groupId)
  }

  func setHoldings(groupId: String, coinId: String, holdings: Double?) async throws {
    try await repository.setHoldings(groupId: groupId, coinId: coinId, holdings: holdings)
  }
}

extension Array {
  nonisolated func chunked(into size: Int) -> [[Element]] {
    guard size > 0 else { return [self] }
    return stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
  }
}

#if DEBUG
extension WatchlistDataStore {
  func seedPreview(loadCharts: Bool = true) {
    bootstrap = PreviewFixtures.bootstrap
    hasLoadedBootstrap = true
    publishQuotes(Dictionary(uniqueKeysWithValues: PreviewFixtures.quotes.map { ($0.id, $0) }))
    quotesUpdatedAt = .now
    aggregate1dByGroup = loadCharts ? Dictionary(uniqueKeysWithValues: bootstrap.groups.map { ($0.id, PreviewFixtures.returns) }) : [:]
    if ProcessInfo.processInfo.arguments.contains("--preview-delayed-charts") {
      aggregate1dByGroup.removeValue(forKey: PreviewFixtures.group.id)
    }
  }
}
#endif
