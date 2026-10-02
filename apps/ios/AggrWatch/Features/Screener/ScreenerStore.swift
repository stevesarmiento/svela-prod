import AggrAPI
import AggrCore
import Foundation
import Observation

/// Port of `screener-context.tsx` + `use-screener-url-state.ts` + `use-screener-results.ts` + `use-screener-taker-flow.ts`.
/// State is derivable to the web URL (`route`), persisted per scene so relaunch restores like a reload.
@Observable
final class ScreenerStore {
  nonisolated enum Source: String { case screen, search, browse }

  private(set) var dsl: ScreeningDsl?
  private(set) var sort: ScreenerSort?
  private(set) var q: String = ""

  private(set) var rows: [ScreenerMarketRow] = []
  /// `rows` under the client-side sort; stored and recomputed once when `rows`/`sort`/`source` change.
  private(set) var sortedRows: [ScreenerMarketRow] = []
  /// Bumped once per `sortedRows` change: cheaper for `onChange` than diffing 500 ids per body.
  private(set) var rowsRevision = 0
  private(set) var source: Source = .browse
  private(set) var coverage: ScreenCoverage?
  private(set) var screenUserMessage: String?
  private(set) var isLoading = false
  private(set) var isFetching = false
  private(set) var error: String?
  private(set) var lastUpdatedAtMs: Double?

  private(set) var takerById: [String: TakerFlowMetrics] = [:]
  private(set) var takerLoading = false
  private(set) var isInterpreting = false

  static let browseLimit = 500
  static let searchLimit = 50

  private let api: ScreenerAPI
  private let market: MarketAPI
  private let cache: QueryCache
  private var resultsTask: Task<Void, Never>?
  private var takerTask: Task<Void, Never>?
  private var pollTask: Task<Void, Never>?
  private var takerKey = ""
  private var loadGeneration = UUID()
  private var searchDebounceTask: Task<Void, Never>?
  static let searchDebounce: Duration = .milliseconds(250)

  init(api: ScreenerAPI, market: MarketAPI, cache: QueryCache) {
    self.api = api; self.market = market; self.cache = cache
    restore()
  }

  // MARK: URL-equivalent state

  var webURLQuery: String {
    var items: [URLQueryItem] = []
    if let dsl { items.append(.init(name: "dsl", value: ScreenerUrlCodec.encode(dsl))) }
    if let sort { items.append(.init(name: "sort", value: sort.serialized)) }
    if !q.isEmpty { items.append(.init(name: "q", value: q)) }
    var c = URLComponents(); c.queryItems = items.isEmpty ? nil : items
    return c.percentEncodedQuery.map { "?\($0)" } ?? ""
  }

  func setDsl(_ next: ScreeningDsl?) { cancelSearchDebounce(); if dsl != next { dsl = next }; persist(); reload() }
  func setSort(_ next: ScreenerSort?) {
    cancelSearchDebounce()
    guard sort != next else { return }
    sort = next; resort(); persist(); reload()
  }
  /// The field reflects `q` immediately; persisting and reloading wait for a 250ms typing pause
  /// (clearing applies at once).
  func setQ(_ next: String) {
    guard q != next else { return }
    q = next
    cancelSearchDebounce()
    if next.isEmpty { persist(); reload(); return }
    searchDebounceTask = Task { [weak self] in
      do { try await Task.sleep(for: Self.searchDebounce) } catch { return }
      guard let self, !Task.isCancelled else { return }
      self.searchDebounceTask = nil
      self.persist(); self.reload()
    }
  }
  /// Apply an NL result atomically: new DSL, sort/search intent reset.
  func applyScreen(_ next: ScreeningDsl) { cancelSearchDebounce(); dsl = next; sort = nil; q = ""; resort(); persist(); reload() }
  func clearAll() { cancelSearchDebounce(); dsl = nil; sort = nil; q = ""; resort(); persist(); reload() }

  /// Deep link `/screener?dsl=&sort=&q=` — fail-closed to browse.
  func applyLink(dsl: String?, sort: String?, q: String?) {
    cancelSearchDebounce()
    self.dsl = dsl.flatMap(ScreenerUrlCodec.decode)
    self.sort = sort.flatMap(ScreenerSort.parse)
    self.q = q ?? ""
    resort(); persist(); reload()
  }

  private func cancelSearchDebounce() { searchDebounceTask?.cancel(); searchDebounceTask = nil }

  private func persist() {
    #if DEBUG
    if PreviewData.isRunning { return }
    #endif
    let d = UserDefaults.standard
    d.set(dsl.map(ScreenerUrlCodec.encode), forKey: "screener.dsl")
    d.set(sort?.serialized, forKey: "screener.sort")
    d.set(q, forKey: "screener.q")
  }

  private func restore() {
    #if DEBUG
    if PreviewData.isRunning { return }
    #endif
    let d = UserDefaults.standard
    dsl = d.string(forKey: "screener.dsl").flatMap(ScreenerUrlCodec.decode)
    sort = d.string(forKey: "screener.sort").flatMap(ScreenerSort.parse)
    q = d.string(forKey: "screener.q") ?? ""
  }

  // MARK: Results

  var mergedDsl: ScreeningDsl? { dsl.map { ScreenerUrlCodec.mergeSort($0, sort: sort) } }

  /// Client-side sort only for "name" (others are server-side under `limit`); browse/search sort locally.
  nonisolated static func sorted(_ rows: [ScreenerMarketRow], sort: ScreenerSort?, source: Source) -> [ScreenerMarketRow] {
    guard let sort else { return rows }
    if source == .screen && sort.key != .name { return rows }
    if sort.key == .name {
      // Lowercase once per row, not once per comparison.
      let keyed = rows.map { ($0, $0.name.lowercased()) }
      return keyed.sorted { sort.desc ? $0.1 > $1.1 : $0.1 < $1.1 }.map(\.0)
    }
    func key(_ r: ScreenerMarketRow) -> Double {
      switch sort.key {
      case .name: return 0
      case .price: return r.currentPrice ?? 0
      case .marketCap: return r.marketCap ?? 0
      case .volume: return r.totalVolume ?? 0
      case .change: return r.priceChangePercentage24h ?? 0
      }
    }
    return rows.sorted { a, b in
      let ka = key(a), kb = key(b)
      return sort.desc ? ka > kb : ka < kb
    }
  }

  private func resort() {
    let next = Self.sorted(rows, sort: sort, source: source)
    if next != sortedRows { sortedRows = next; rowsRevision &+= 1 }
  }

  /// Publishes a result set; unchanged payloads (the 60s poll) cost no invalidation.
  private func publish(rows next: [ScreenerMarketRow], coverage nextCoverage: ScreenCoverage?, userMessage: String?, lastUpdatedAtMs nextUpdated: Double?) {
    if rows != next { rows = next; resort() }
    if coverage != nextCoverage { coverage = nextCoverage }
    if screenUserMessage != userMessage { screenUserMessage = userMessage }
    if lastUpdatedAtMs != nextUpdated { lastUpdatedAtMs = nextUpdated }
    if error != nil { error = nil }
  }

  private func setSource(_ next: Source) {
    guard source != next else { return }
    source = next
    resort()
  }

  private func beginLoad(showsSkeleton: Bool) -> UUID {
    let generation = UUID(); loadGeneration = generation
    if isLoading != showsSkeleton { isLoading = showsSkeleton }
    if !isFetching { isFetching = true }
    return generation
  }

  private func endLoad(_ generation: UUID) {
    guard loadGeneration == generation else { return }
    if isLoading { isLoading = false }
    if isFetching { isFetching = false }
  }

  private func setError(_ message: String, generation: UUID) {
    guard !Task.isCancelled, loadGeneration == generation, error != message else { return }
    error = message
  }

  func start() {
    reload()
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(60)) } catch { return }
        await self?.refreshTaker(force: false)
        await self?.reloadIfStale()
      }
    }
  }

  func stop() {
    resultsTask?.cancel(); takerTask?.cancel(); pollTask?.cancel(); cancelSearchDebounce()
    loadGeneration = UUID()
    if isFetching { isFetching = false }
    if isLoading { isLoading = false }
    if takerLoading { takerLoading = false }
  }

  /// Poll: reload only when the current result's cache entry is stale, like `refreshTaker`.
  private func reloadIfStale() async {
    if let merged = mergedDsl {
      if await cache.isStale(.init("screener", "execute", ScreenerUrlCodec.canonicalKey(merged)), policy: .screenResults) { reload() }
      return
    }
    let text = q.trimmingCharacters(in: .whitespaces)
    if !text.isEmpty {
      // Search rows carry quotes (30s stale); the summaries themselves are stable for 10 minutes.
      let summaries: [CoinSummary]? = await cache.peek(.init("coins-search", text, String(Self.searchLimit)))
      guard let summaries, !summaries.isEmpty else { reload(); return }
      let ids = summaries.map(\.coingeckoId).sorted().joined(separator: ",")
      if await cache.isStale(.init("coingecko-quotes", ids), policy: .quotes) { reload() }
      return
    }
    if await cache.isStale(.init("screener", "top-markets", String(Self.browseLimit)), policy: .screenerTop) { reload() }
  }

  func reload(force: Bool = false) {
    resultsTask?.cancel()
    resultsTask = Task { [weak self] in
      guard let self, !Task.isCancelled else { return }
      if let merged = mergedDsl { await loadScreen(merged, force: force) }
      else if !q.trimmingCharacters(in: .whitespaces).isEmpty { await loadSearch(q.trimmingCharacters(in: .whitespaces), force: force) }
      else { await loadBrowse(force: force) }
    }
  }

  func refetch() {
    reload(force: true)
  }

  private func loadScreen(_ merged: ScreeningDsl, force: Bool = false) async {
    setSource(.screen)
    let generation = beginLoad(showsSkeleton: rows.isEmpty)
    defer { endLoad(generation) }
    do {
      let key = QueryCache.Key("screener", "execute", ScreenerUrlCodec.canonicalKey(merged))
      let response = try await cache.fetch(key, policy: .screenResults, force: force) { [api] in try await api.screen(ScreenRequest(dsl: merged)) }
      guard !Task.isCancelled, loadGeneration == generation else { return }
      publish(rows: response.rows.map(\.marketRow), coverage: response.coverage, userMessage: response.userMessage, lastUpdatedAtMs: nil)
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { setError(error.localizedDescription, generation: generation) }
  }

  private func loadSearch(_ text: String, force: Bool = false) async {
    setSource(.search)
    let generation = beginLoad(showsSkeleton: true)
    defer { endLoad(generation) }
    do {
      let key = QueryCache.Key("coins-search", text, String(Self.searchLimit))
      let summaries = try await cache.fetch(key, policy: .search, force: force) { [market] in try await market.searchCoins(query: text, limit: Self.searchLimit) }
      guard !Task.isCancelled else { return }
      let ids = summaries.map(\.coingeckoId)
      let quotes: [String: CoinQuote] = ids.isEmpty ? [:] : try await cache.fetch(.init("coingecko-quotes", ids.sorted().joined(separator: ",")), policy: .quotes, force: force) { [market] in try await market.quotes(ids: ids, sparkline: false).data }
      guard !Task.isCancelled, loadGeneration == generation else { return }
      let next = summaries.map { s in
        let qte = quotes[s.coingeckoId]
        return ScreenerMarketRow(coingeckoId: s.coingeckoId, symbol: s.symbol, name: s.name, image: s.logoUrl.isEmpty ? (qte?.image ?? "") : s.logoUrl,
                                 currentPrice: qte?.currentPrice, marketCap: qte?.marketCap, marketCapRank: qte?.marketCapRank.map(Double.init),
                                 totalVolume: qte?.totalVolume, priceChangePercentage24h: qte?.priceChangePercentage24h)
      }
      publish(rows: next, coverage: nil, userMessage: nil, lastUpdatedAtMs: nil)
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { setError(error.localizedDescription, generation: generation) }
  }

  private func loadBrowse(force: Bool) async {
    setSource(.browse)
    let generation = beginLoad(showsSkeleton: rows.isEmpty)
    defer { endLoad(generation) }
    do {
      let key = QueryCache.Key("screener", "top-markets", String(Self.browseLimit))
      let top = try await cache.fetch(key, policy: .screenerTop, force: force) { [market] in try await market.topMarkets(limit: Self.browseLimit) }
      guard !Task.isCancelled, loadGeneration == generation else { return }
      publish(rows: top.map(\.screenerRow), coverage: nil, userMessage: nil, lastUpdatedAtMs: top.compactMap(\.updatedAt).max())
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { setError(error.localizedDescription, generation: generation) }
  }

  private func refreshTaker(force: Bool) async {
    let coins = rows.filter { !$0.symbol.isEmpty }.prefix(500).map { ScreenerAPI.TakerCoin(coingeckoId: $0.coingeckoId, symbol: $0.symbol.uppercased()) }
    let key = coins.map(\.coingeckoId).sorted().joined(separator: ",")
    guard !coins.isEmpty else { if !takerById.isEmpty { takerById = [:] }; return }
    if key == takerKey && !force, !(await cache.isStale(.init("screener", "taker-flow", key), policy: .takerFlow)) { return }
    takerKey = key
    takerTask?.cancel()
    if takerLoading != takerById.isEmpty { takerLoading = takerById.isEmpty }
    takerTask = Task { [weak self] in
      guard let self else { return }
      defer { if takerLoading { takerLoading = false } }
      do {
        let response = try await cache.fetch(.init("screener", "taker-flow", key), policy: .takerFlow, force: force) { [api] in try await api.takerMetrics(coins: Array(coins), range: "24h") }
        guard !Task.isCancelled else { return }
        var out: [String: TakerFlowMetrics] = [:]
        for (id, m) in response.byId { if let m { out[id] = m } }
        if takerById != out { takerById = out }
      } catch {}
    }
  }

  // MARK: Smart prompt

  /// `interpret.run`: NL → unified endpoint; on `ok` seed the execute cache and apply the DSL.
  func interpret(_ text: String) async -> ScreenResponse? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    isInterpreting = true
    defer { if isInterpreting { isInterpreting = false } }
    do {
      let response = try await api.screen(ScreenRequest(text: trimmed))
      if response.ok {
        await cache.set(.init("screener", "execute", ScreenerUrlCodec.canonicalKey(response.dsl)), value: response)
        applyScreen(response.dsl)
      }
      return response
    } catch {
      if !Task.isCancelled { self.error = error.localizedDescription }
      return nil
    }
  }

  /// `coverageCaption`
  var coverageCaption: String? {
    guard source == .screen, let c = coverage else { return nil }
    var parts = ["Showing \(rows.count) of \(Int(c.matched)) matched", "\(Int(c.scanned)) scanned"]
    for (id, count) in c.missingByMetricId.sorted(by: { $0.key < $1.key }) where count > 0 {
      parts.append("\(Int(count)) missing \(id.replacingOccurrences(of: "_", with: " "))")
    }
    return parts.joined(separator: " · ")
  }
}

#if DEBUG
extension ScreenerStore {
  func seedPreview(state: PreviewData.State) {
    dsl = nil; sort = nil; q = ""
    rows = state == .populated ? PreviewFixtures.marketRows.map(\.screenerRow) : []
    resort()
    isLoading = state == .loading
    error = state == .error ? "Sample connection error. Please try again." : nil
    lastUpdatedAtMs = Double(PreviewFixtures.now) * 1000
  }
}
#endif
