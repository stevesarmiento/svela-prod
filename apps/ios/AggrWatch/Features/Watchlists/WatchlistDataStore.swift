import AggrAPI
import AggrCore
import Foundation
import Observation

/// Shared user-data store: Convex page bootstrap (groups + items + holdings), bulk quotes (30s stale / 5m poll),
/// and per-group 1D equal-weight aggregate series (market-chart fan-out, concurrency 5, 5m poll).
/// Mirrors `watchlist-context.tsx`, `use-coingecko-quotes.ts`, `use-coingecko-watchlist-aggregate-chart-isolated.ts`.
@Observable
final class WatchlistDataStore {
  private(set) var bootstrap: WatchlistsPageBootstrap = .empty
  private(set) var hasLoadedBootstrap = false
  private(set) var bootstrapError: String?

  private(set) var quotesById: [String: CoinQuote] = [:]
  private(set) var isQuotesLoading = false
  private(set) var quotesError: String?
  private(set) var quotesUpdatedAt: Date?

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

  func quote(_ coinId: String) -> CoinQuote? { quotesById[coinId] }

  func isInAnyWatchlist(_ coinId: String) -> Bool {
    bootstrap.itemsByGroupId.values.contains { $0.contains { $0.coinId == coinId } }
  }

  func isInGroup(_ coinId: String, groupId: String) -> Bool {
    bootstrap.itemsByGroupId[groupId]?.contains { $0.coinId == coinId } ?? false
  }

  /// Latest 1D aggregate change for a group; falls back to a quote-based equal-weight estimate.
  func aggregateChange1d(for group: WatchlistGroup) -> (value: Double, isEstimate: Bool)? {
    if let last = aggregate1dByGroup[group.id]?.last { return (last.value, false) }
    let pcts = coinIds(in: group).map { quotesById[$0]?.priceChangePercentage24h }
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
          self.bootstrap = next
          self.hasLoadedBootstrap = true
          self.bootstrapError = nil
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
    isQuotesLoading = false; isAggregateLoading = false
    aggregatePendingGroupIDs = []
  }

  func stop() {
    pause()
    bootstrap = .empty
    hasLoadedBootstrap = false
    quotesById = [:]
    aggregate1dByGroup = [:]
    lastCoinIdsKey = ""; lastMembershipKey = ""
    bootstrapError = nil; quotesError = nil; quotesUpdatedAt = nil
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
    guard !ids.isEmpty else { quotesById = [:]; return }
    isQuotesLoading = quotesById.isEmpty
    defer { isQuotesLoading = false }
    do {
      let generation = subscriptionGeneration
      let merged = try await fetchQuotes(ids: ids, force: force)
      guard !Task.isCancelled, generation == subscriptionGeneration else { return }
      // Newest-wins merge (`shouldSyncQuote`): keep existing entries the new payload lacks.
      var next = quotesById
      for (id, q) in merged { next[id] = q }
      quotesById = next
      quotesUpdatedAt = Date()
      quotesError = nil
    } catch is CancellationError {
    } catch {
      quotesError = error.localizedDescription
    }
  }

  /// Bulk quotes with sparkline, chunked to stay under upstream page limits.
  func fetchQuotes(ids: [String], force: Bool) async throws -> [String: CoinQuote] {
    let sorted = Array(Set(ids)).sorted()
    let key = QueryCache.Key("coingecko-quotes", sorted.joined(separator: ","))
    let market = self.market
    return try await cache.fetch(key, policy: .quotes, force: force) {
      var out: [String: CoinQuote] = [:]
      for chunk in sorted.chunked(into: 150) {
        let response = try await market.quotes(ids: chunk, sparkline: true)
        out.merge(response.data) { _, new in new }
      }
      return out
    }
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
    aggregatePendingGroupIDs = Set(byGroup.filter { !$0.1.isEmpty }.map(\.0))
    isAggregateLoading = !allIds.isEmpty
    aggregate1dByGroup = aggregate1dByGroup.filter { !(pending[$0.key]?.isEmpty ?? true) }
    guard !allIds.isEmpty else { aggregate1dByGroup = [:]; return }
    // Fetching and having cached data are independent. Individual cards decide
    // whether they need a loading treatment, while ready cards retain their chart.
    defer {
      if generation == subscriptionGeneration, requestID == aggregateRequestID {
        isAggregateLoading = false
        aggregatePendingGroupIDs = []
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
        aggregatePendingGroupIDs.remove(groupId)
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
        if updated.count >= 2 || cached.isEmpty { aggregate1dByGroup[groupId] = updated }
      }
    }
  }

  struct ChartSeries: Sendable { var points: [TimePoint]; var warming: Bool }

  /// Fan-out market-chart fetches (concurrency 5) through the cache; failures are swallowed to nil like the web.
  static func fetchMarketChartSeries(ids: [String], days: String, market: MarketAPI, cache: QueryCache, force: Bool,
                                     onResult: ((String, ChartSeries?) async -> Void)? = nil) async -> [String: ChartSeries] {
    var result: [String: ChartSeries] = [:]
    await withTaskGroup(of: (String, ChartSeries?).self) { group in
      var iterator = ids.makeIterator()
      var running = 0
      func enqueue(_ id: String, _ group: inout TaskGroup<(String, ChartSeries?)>) {
        group.addTask {
          let key = QueryCache.Key("market-chart", id, days)
          do {
            let response = try await cache.fetch(key, policy: .aggregateChart, force: force) {
              try await market.marketChart(coinId: id, days: days)
            }
            let pts = response.data.prices.map { TimePoint(epochSeconds: TimePoint.normalizeEpochSeconds($0.time), value: $0.value) }
            return (id, ChartSeries(points: pts, warming: response.status?.needsWarmup ?? false))
          } catch {
            return (id, nil)
          }
        }
      }
      while running < 5, let id = iterator.next() { enqueue(id, &group); running += 1 }
      for await (id, series) in group {
        guard !Task.isCancelled else { group.cancelAll(); break }
        if let series { result[id] = series }
        await onResult?(id, series)
        if let next = iterator.next() { enqueue(next, &group) }
      }
    }
    return result
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
    quotesById = Dictionary(uniqueKeysWithValues: PreviewFixtures.quotes.map { ($0.id, $0) })
    quotesUpdatedAt = .now
    aggregate1dByGroup = loadCharts ? Dictionary(uniqueKeysWithValues: bootstrap.groups.map { ($0.id, PreviewFixtures.returns) }) : [:]
    if ProcessInfo.processInfo.arguments.contains("--preview-delayed-charts") {
      aggregate1dByGroup.removeValue(forKey: PreviewFixtures.group.id)
    }
  }
}
#endif
