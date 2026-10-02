import AggrAPI
import AggrCore
import Foundation
import Observation

/// Port of `overview-holdings-section.tsx` data wiring.
///
/// Derived values are stored and rebuilt when their inputs change, not recomputed per view body:
/// `positions` when the holdings breakdown changes, the rebased chart series when either series
/// changes, and the news groups when the events or their sentiment overlay change. Scrub lookups
/// are binary searches over the already-sorted series.
@Observable
final class OverviewStore {
  private(set) var bootstrapError: String?
  private(set) var holdingsError: String?
  private(set) var refreshError: String?
  private(set) var seriesError: String?
  private(set) var marketError: String?
  var error: String? { bootstrapError ?? holdingsError ?? refreshError }
  var hasLoaded: Bool { bootstrap != nil && breakdown != nil }
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var seriesRequest = UUID()
  @ObservationIgnored private var snapshotTask: Task<Void, Never>?
  @ObservationIgnored private var scaleTask: Task<Void, Never>?
  @ObservationIgnored private var positionsTask: Task<Void, Never>?
  private(set) var bootstrap: OverviewBootstrap?
  private(set) var breakdown: [OverviewHoldingsGroup]?
  private(set) var valueSeries: [TimePoint] = []
  private(set) var marketSeries: [TimePoint] = []
  private(set) var marketWarming = false
  private(set) var marketLoading = false
  private(set) var seriesLoading = false
  private(set) var sentimentOverlay: [String: NewsSentimentOverlayRow] = [:]
  var scale: TimeScale = .d1 {
    didSet {
      guard scale != oldValue else { return }
      scrubTime = nil
      valueSeries = []; marketSeries = []
      seriesLoadedAt = nil
      rebuildSeriesDerived()
      guard !tasks.isEmpty else { return }
      scaleTask?.cancel()
      scaleTask = Task { await loadSeries(force: false) }
    }
  }
  var scrubTime: Int?

  private let repo: OverviewRepository
  private let watchlistData: WatchlistDataStore
  private let market: MarketAPI
  private let cache: QueryCache
  @ObservationIgnored private var tasks: [Task<Void, Never>] = []
  @ObservationIgnored private var snapshotRequestKey = ""
  @ObservationIgnored private var overlayTask: Task<Void, Never>?
  @ObservationIgnored private var overlayKey = ""
  @ObservationIgnored private var lastPositionsKey: String?
  @ObservationIgnored private var seriesLoadedAt: Date?
  /// Series older than this are refreshed when subscriptions resume after a background stop.
  private let resumeStaleness: TimeInterval = 300

  init(repo: OverviewRepository, watchlistData: WatchlistDataStore, market: MarketAPI, cache: QueryCache) {
    self.repo = repo; self.watchlistData = watchlistData; self.market = market; self.cache = cache
  }

  // MARK: Derived (mirrors the hooks' useMemos)

  var groupsBreakdown: [OverviewHoldingsGroup] { breakdown ?? bootstrap?.holdingsBreakdown ?? [] }

  /// Aggregated holdings per coin, sorted by coin id. Rebuilt when the breakdown changes.
  private(set) var positions: [AggregateSeries.Position] = []
  @ObservationIgnored private var positionsKey = ""

  var hasHoldings: Bool { !positions.isEmpty }

  private func rebuildPositions() {
    var byCoin: [String: Double] = [:]
    for row in groupsBreakdown { for p in row.positions where p.holdings.isFinite && p.holdings > 0 { byCoin[p.coinId, default: 0] += p.holdings } }
    let next = byCoin.keys.sorted().map { AggregateSeries.Position(coinId: $0, holdings: byCoin[$0]!) }
    guard next != positions else { return }
    positions = next
    positionsKey = next.map { "\($0.coinId):\($0.holdings)" }.joined(separator: ",")
    rebuildSeriesDerived()
  }

  var pricedPositionCount: Int {
    positions.filter { position in
      guard let price = watchlistData.quote(position.coinId)?.currentPrice else { return false }
      return price.isFinite && price > 0
    }.count
  }
  var totalValueUsd: Double? {
    guard hasLoaded, pricedPositionCount == positions.count else { return nil }
    return positions.reduce(0) { $0 + $1.holdings * (watchlistData.quote($1.coinId)?.currentPrice ?? 0) }
  }
  var coverageNote: String? {
    guard hasLoaded, pricedPositionCount != positions.count else { return nil }
    return "\(pricedPositionCount) of \(positions.count) positions priced"
  }

  var watchlistCoinIds: [String] { Array(Set(positions.map(\.coinId) + watchlistData.bootstrap.allCoinIds)) }

  var breadth: BreadthStats? {
    let pcts = watchlistCoinIds.compactMap { watchlistData.quote($0)?.priceChangePercentage24h }.filter { $0.isFinite }
    return BreadthStats.compute(pcts) ?? bootstrap?.movers24h?.breadth
  }

  struct BreadthGroupRow: Identifiable { var id: String; var name: String; var slug: String; var color: String; var changePct: Double; var coinCount: Int }

  var breadthGroups: [BreadthGroupRow] {
    var rows: [BreadthGroupRow] = []
    for g in watchlistData.groups {
      var seen = Set<String>(); var sum = 0.0; var n = 0
      for item in watchlistData.items(in: g) where !seen.contains(item.coinId) {
        seen.insert(item.coinId)
        if let pct = watchlistData.quote(item.coinId)?.priceChangePercentage24h, pct.isFinite { sum += pct; n += 1 }
      }
      if n > 0 { rows.append(BreadthGroupRow(id: g.id, name: g.name, slug: g.slug, color: g.color ?? "default", changePct: sum / Double(n), coinCount: n)) }
    }
    return rows.sorted { $0.changePct > $1.changePct }
  }

  // MARK: Series-derived (rebuilt when `valueSeries` / `marketSeries` / positions change)

  private(set) var rebased: OverviewPerformance.RebasedComparison = .empty
  private(set) var portfolioChartPoints: [TimePoint] = []
  private(set) var marketChartPoints: [TimePoint] = []
  /// Sorted, time-unique copies of the raw series for O(log n) scrub lookups.
  @ObservationIgnored private var sortedValueSeries: [TimePoint] = []
  @ObservationIgnored private var sortedMarketSeries: [TimePoint] = []

  private func rebuildSeriesDerived() {
    sortedValueSeries = SeriesLookup.sortedUnique(valueSeries)
    sortedMarketSeries = SeriesLookup.sortedUnique(marketSeries)
    let next = OverviewPerformance.buildRebasedComparison(portfolio: valueSeries, market: marketSeries)
    let portfolio = next.portfolioPoints.isEmpty ? OverviewPerformance.rebaseFromFirstPoint(valueSeries) : next.portfolioPoints
    // Use a shared baseline when comparing holdings; a market-only chart can stand alone.
    let market = portfolio.isEmpty ? OverviewPerformance.rebaseFromFirstPoint(marketSeries) : next.marketPoints
    if next != rebased { rebased = next }
    if portfolio != portfolioChartPoints { portfolioChartPoints = portfolio }
    if market != marketChartPoints { marketChartPoints = market }
  }

  var chartNote: String? {
    guard hasHoldings, rebased.marketPoints.isEmpty else { return nil }
    return (marketLoading || marketWarming) ? "Market benchmark warming" : "Market benchmark unavailable"
  }

  // MARK: Scrub-dependent (O(log n); only the readout views observe `scrubTime`)

  var scrubbedValue: Double? { scrubTime.flatMap { SeriesLookup.nearestValue(sortedValueSeries, time: $0) } }
  var displayValueUsd: Double? { scrubbedValue ?? totalValueUsd }

  var displayMarketCapUsd: Double? {
    scrubTime.flatMap { SeriesLookup.nearestValue(sortedMarketSeries, time: $0) } ?? marketSeries.last?.value
  }

  struct RangeChange { var deltaUsd: Double; var deltaPct: Double; var isAvailable: Bool }
  var rangeChange: RangeChange {
    guard valueSeries.count >= 2, let start = valueSeries.first?.value, start.isFinite, start > 0 else { return RangeChange(deltaUsd: 0, deltaPct: 0, isAvailable: false) }
    let end = scrubbedValue ?? valueSeries.last!.value
    guard end.isFinite else { return RangeChange(deltaUsd: 0, deltaPct: 0, isAvailable: false) }
    let d = end - start
    return RangeChange(deltaUsd: d, deltaPct: d / start * 100, isAvailable: true)
  }

  // MARK: News (rebuilt when the events or their sentiment overlay change)

  struct NewsGroup: Identifiable { var label: String; var events: [OverviewEvent]; var id: String { label } }
  private(set) var newsEvents: [OverviewEvent] = []
  private(set) var newsGroups: [NewsGroup] = []
  @ObservationIgnored private var newsGroupsDay: Date?

  private func rebuildNews() {
    let events = (bootstrap?.events?.events ?? []).filter { $0.kind == .news }.map { e in
      guard let a = e.articleId, let o = sentimentOverlay[a] else { return e }
      var m = e
      m.sentiment = o.sentiment ?? e.sentiment
      m.aiSummary = o.aiSummary ?? e.aiSummary
      m.aiCategory = o.aiCategory ?? e.aiCategory
      return m
    }
    let day = Calendar.current.startOfDay(for: Date())
    guard events != newsEvents || day != newsGroupsDay else { return }
    newsEvents = events
    newsGroupsDay = day
    var groups: [NewsGroup] = []
    let now = Date()
    for e in events {
      let label = FeedHelpers.dateBucket(ms: e.occurredAtMs, now: now)
      if groups.last?.label == label { groups[groups.count - 1].events.append(e) } else { groups.append(NewsGroup(label: label, events: [e])) }
    }
    newsGroups = groups
  }

  /// "Today"/"Yesterday" labels depend on the calendar day; sleep until the next midnight and regroup.
  private func scheduleNewsDayRollover() {
    tasks.append(Task { [weak self] in
      while !Task.isCancelled {
        let calendar = Calendar.current
        let now = Date()
        guard let next = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) else { return }
        do { try await Task.sleep(for: .seconds(max(1, next.timeIntervalSince(now) + 1))) } catch { return }
        self?.rebuildNews()
      }
    })
  }

  var isEmptyDashboard: Bool { bootstrap != nil && (bootstrap?.watchlistCoinCount ?? 0) == 0 }

  // MARK: Lifecycle

  /// Opens the Convex subscriptions; a no-op while they are already running. Subscriptions stay
  /// open across tab switches and only stop on background (`stop()`) or user change (`reset()`).
  func start() {
    guard tasks.isEmpty else { return }
    let generation = self.generation
    bootstrapError = nil; holdingsError = nil
    tasks.append(Task { [weak self] in
      guard let self else { return }
      do {
        for try await b in repo.bootstrap() {
          guard !Task.isCancelled, self.generation == generation else { return }
          if self.bootstrap != b {
            self.bootstrap = b
            self.rebuildPositions()
            self.rebuildNews()
          }
          self.bootstrapError = nil
          self.requestSnapshotRefreshIfStale(b)
          self.refreshOverlay()
        }
      } catch { if !Task.isCancelled { self.bootstrapError = error.localizedDescription } }
    })
    tasks.append(Task { [weak self] in
      guard let self else { return }
      do {
        for try await rows in repo.holdingsBreakdown() {
          guard !Task.isCancelled, self.generation == generation else { return }
          if self.breakdown != rows {
            self.breakdown = rows
            self.rebuildPositions()
          }
          self.holdingsError = nil
          // Fan out off the subscription loop so a slow chart fetch never delays the next row update.
          self.positionsTask = Task { [weak self] in await self?.loadSeriesIfPositionsChanged() }
        }
      } catch { if !Task.isCancelled { self.holdingsError = error.localizedDescription } }
    })
    tasks.append(Task { [weak self] in
      // 30m poll (use-holdings-value-over-time / use-global-market-cap-over-time).
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(1800)) } catch { return }
        await self?.loadSeries(force: true)
      }
    })
    scheduleNewsDayRollover()
    // Resuming after a background stop keeps the loaded series; refresh them when stale or when a
    // load never finished (cancelled mid-flight, or the scale changed and nothing arrived yet).
    if lastPositionsKey != nil {
      let stale = seriesLoadedAt.map { Date().timeIntervalSince($0) > resumeStaleness } ?? true
      if stale { positionsTask = Task { [weak self] in await self?.loadSeries(force: false) } }
    }
  }

  /// Cancels every subscription and in-flight request, keeping loaded data and the positions key
  /// so the next `start()` does not fan out the chart fetches again for unchanged holdings.
  func stop() {
    // A fan-out cancelled mid-flight has not produced series: let the next emission reload them.
    if seriesLoadedAt == nil || seriesLoading || marketLoading { lastPositionsKey = nil }
    generation += 1; seriesRequest = UUID()
    seriesLoading = false; marketLoading = false
    overlayKey = ""
    snapshotTask?.cancel(); snapshotTask = nil; snapshotRequestKey = ""
    scaleTask?.cancel(); scaleTask = nil
    positionsTask?.cancel(); positionsTask = nil
    tasks.forEach { $0.cancel() }; tasks = []
    overlayTask?.cancel(); overlayTask = nil
  }

  /// `stop()` plus forgetting the positions key, for a different user or an explicit retry.
  func reset() {
    stop()
    lastPositionsKey = nil; seriesLoadedAt = nil
    bootstrap = nil; breakdown = nil
    positions = []; positionsKey = ""
    valueSeries = []; marketSeries = []
    sentimentOverlay = [:]
    newsEvents = []; newsGroups = []; newsGroupsDay = nil
    seriesError = nil; marketError = nil
    rebuildSeriesDerived()
  }

  func retry() {
    reset(); snapshotRequestKey = ""; refreshError = nil; start()
  }

  private func requestSnapshotRefreshIfStale(_ b: OverviewBootstrap) {
    guard !b.isFresh else { return }
    let key = "\(b.status):\(b.generatedAt.map { String($0) } ?? "null")"
    guard key != snapshotRequestKey else { return }
    snapshotRequestKey = key
    snapshotTask?.cancel()
    snapshotTask = Task {
      do { _ = try await repo.refreshSnapshot(force: false); refreshError = nil }
      catch {
        if !Task.isCancelled { snapshotRequestKey = ""; refreshError = error.localizedDescription }
      }
    }
  }

  private func refreshOverlay() {
    let ids = Array(Set((bootstrap?.events?.events ?? []).filter { $0.kind == .news }.compactMap(\.articleId).filter { !$0.isEmpty })).sorted()
    let key = ids.joined(separator: ",")
    guard key != overlayKey else { return }
    overlayKey = key
    overlayTask?.cancel()
    guard !ids.isEmpty else {
      if !sentimentOverlay.isEmpty { sentimentOverlay = [:]; rebuildNews() }
      return
    }
    overlayTask = Task { [weak self] in
      guard let self else { return }
      do {
        for try await rows in repo.sentimentOverlay(articleIds: ids) {
          let next = Dictionary(rows.map { ($0.articleId, $0) }, uniquingKeysWith: { a, _ in a })
          guard next != self.sentimentOverlay else { continue }
          self.sentimentOverlay = next
          self.rebuildNews()
        }
      } catch {}
    }
  }

  private func loadSeriesIfPositionsChanged() async {
    let key = positionsKey
    guard key != lastPositionsKey else { return }
    lastPositionsKey = key
    await loadSeries(force: false)
  }

  private enum SeriesResult: Sendable {
    case portfolio([TimePoint])
    case market([TimePoint], warming: Bool, error: String?)
  }

  /// Both requests share time buckets, but publish independently like the two web hooks.
  func loadSeries(force: Bool) async {
    let scale = self.scale
    let positions = self.positions
    let request = UUID(); seriesRequest = request
    let generation = self.generation
    let end = scale.rangeEndMs(now: Date())
    let market = self.market, cache = self.cache
    seriesLoading = true; marketLoading = true; marketError = nil
    defer { if seriesRequest == request { seriesLoading = false; marketLoading = false } }
    await withTaskGroup(of: SeriesResult.self) { group in
      group.addTask {
        do {
          let key = QueryCache.Key("global-market-cap", scale.globalMarketCapDaysParam)
          let response = try await cache.fetch(key, policy: .globalMarketCap, force: force) {
            try await market.globalMarketCap(days: scale.globalMarketCapDaysParam)
          }
          let start = end - scale.rangeDays * 86_400_000
          let buckets = TimeScale.bucketTimesMs(start: start, end: end, bucketMs: scale.bucketMs).map { $0 / 1000 }
          let src = response.data.market_cap.filter { $0.time.isFinite && $0.value.isFinite && $0.value > 0 }
            .map { TimePoint(epochSeconds: TimePoint.normalizeEpochSeconds($0.time), value: $0.value) }
          return .market(OverviewPerformance.forwardFill(source: src, bucketTimesSec: buckets),
                         warming: response.status?.needsWarmup ?? false, error: nil)
        } catch {
          return .market([], warming: false, error: error.localizedDescription)
        }
      }
      group.addTask {
        guard !positions.isEmpty else { return .portfolio([]) }
        let series = await WatchlistDataStore.fetchMarketChartSeries(ids: positions.map(\.coinId), days: scale.marketChartDaysParam,
                                                                    market: market, cache: cache, force: force)
        guard positions.allSatisfy({ (series[$0.coinId]?.points.count ?? 0) >= 2 }) else { return .portfolio([]) }
        return .portfolio(AggregateSeries.holdingsValueSeries(positions: positions, pricesByCoin: series.mapValues(\.points),
                                                            scale: scale, rangeEndMs: end))
      }
      for await result in group {
        guard !Task.isCancelled, generation == self.generation, seriesRequest == request, scale == self.scale else {
          group.cancelAll(); return
        }
        switch result {
        case .portfolio(let points):
          seriesError = !positions.isEmpty && points.count < 2 ? "Price history is unavailable for one or more positions. Try refreshing." : nil
          if valueSeries != points { valueSeries = points; rebuildSeriesDerived() }
          seriesLoading = false
          seriesLoadedAt = Date()
        case .market(let points, let warming, let error):
          // Keep previously loaded data on a failed refresh, and make the error visible.
          if error == nil, marketSeries != points { marketSeries = points; rebuildSeriesDerived() }
          marketError = error
          marketWarming = warming
          marketLoading = false
        }
      }
    }
  }

}

#if DEBUG
extension OverviewStore {
  func seedPreview() {
    bootstrap = PreviewFixtures.overview
    breakdown = PreviewFixtures.overview.holdingsBreakdown
    valueSeries = PreviewFixtures.line
    marketSeries = PreviewFixtures.chart.marketCap
    rebuildPositions()
    rebuildNews()
    rebuildSeriesDerived()
  }
}
#endif
