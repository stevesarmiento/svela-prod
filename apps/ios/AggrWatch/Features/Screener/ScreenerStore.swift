import AggrAPI
import AggrCore
import Foundation
import Observation

/// Port of `screener-context.tsx` + `use-screener-url-state.ts` + `use-screener-results.ts` + `use-screener-taker-flow.ts`.
/// State is derivable to the web URL (`route`), persisted per scene so relaunch restores like a reload.
@Observable
final class ScreenerStore {
  enum Source: String { case screen, search, browse }

  private(set) var dsl: ScreeningDsl?
  private(set) var sort: ScreenerSort?
  private(set) var q: String = ""

  private(set) var rows: [ScreenerMarketRow] = []
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

  func setDsl(_ next: ScreeningDsl?) { dsl = next; persist(); reload() }
  func setSort(_ next: ScreenerSort?) { sort = next; persist(); reload() }
  func setQ(_ next: String) { q = next; persist(); reload() }
  /// Apply an NL result atomically: new DSL, sort/search intent reset.
  func applyScreen(_ next: ScreeningDsl) { dsl = next; sort = nil; q = ""; persist(); reload() }
  func clearAll() { dsl = nil; sort = nil; q = ""; persist(); reload() }

  /// Deep link `/screener?dsl=&sort=&q=` — fail-closed to browse.
  func applyLink(dsl: String?, sort: String?, q: String?) {
    self.dsl = dsl.flatMap(ScreenerUrlCodec.decode)
    self.sort = sort.flatMap(ScreenerSort.parse)
    self.q = q ?? ""
    persist(); reload()
  }

  private func persist() {
    let d = UserDefaults.standard
    d.set(dsl.map(ScreenerUrlCodec.encode), forKey: "screener.dsl")
    d.set(sort?.serialized, forKey: "screener.sort")
    d.set(q, forKey: "screener.q")
  }

  private func restore() {
    let d = UserDefaults.standard
    dsl = d.string(forKey: "screener.dsl").flatMap(ScreenerUrlCodec.decode)
    sort = d.string(forKey: "screener.sort").flatMap(ScreenerSort.parse)
    q = d.string(forKey: "screener.q") ?? ""
  }

  // MARK: Results

  var mergedDsl: ScreeningDsl? { dsl.map { ScreenerUrlCodec.mergeSort($0, sort: sort) } }

  /// Client-side sort only for "name" (others are server-side under `limit`); browse/search sort locally.
  var sortedRows: [ScreenerMarketRow] {
    guard let sort else { return rows }
    if source == .screen && sort.key != .name { return rows }
    func key(_ r: ScreenerMarketRow) -> Double? {
      switch sort.key {
      case .name: return nil
      case .price: return r.currentPrice
      case .marketCap: return r.marketCap
      case .volume: return r.totalVolume
      case .change: return r.priceChangePercentage24h
      }
    }
    if sort.key == .name {
      return rows.sorted { sort.desc ? $0.name.lowercased() > $1.name.lowercased() : $0.name.lowercased() < $1.name.lowercased() }
    }
    return rows.sorted { a, b in
      let ka = key(a) ?? 0, kb = key(b) ?? 0
      return sort.desc ? ka > kb : ka < kb
    }
  }

  func start() {
    reload()
    pollTask?.cancel()
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(900))
        await self?.refreshTaker(force: true)
        if self?.source == .browse, let self { await self.loadBrowse(force: Date().timeIntervalSince1970 * 1000 - (self.lastUpdatedAtMs ?? 0) > 3_600_000) }
      }
    }
  }

  func stop() { resultsTask?.cancel(); takerTask?.cancel(); pollTask?.cancel() }

  func reload() {
    resultsTask?.cancel()
    resultsTask = Task { [weak self] in
      guard let self else { return }
      if let merged = mergedDsl { await loadScreen(merged) }
      else if !q.trimmingCharacters(in: .whitespaces).isEmpty { await loadSearch(q.trimmingCharacters(in: .whitespaces)) }
      else { await loadBrowse(force: false) }
    }
  }

  func refetch() {
    if source == .browse { Task { await loadBrowse(force: true) } } else { reload() }
  }

  private func loadScreen(_ merged: ScreeningDsl) async {
    source = .screen
    isLoading = rows.isEmpty; isFetching = true
    defer { isLoading = false; isFetching = false }
    do {
      let key = QueryCache.Key("screener", "execute", ScreenerUrlCodec.canonicalKey(merged))
      let response = try await cache.fetch(key, policy: .screenResults) { [api] in try await api.screen(ScreenRequest(dsl: merged)) }
      guard !Task.isCancelled else { return }
      rows = response.rows.map(\.marketRow)
      coverage = response.coverage
      screenUserMessage = response.userMessage
      lastUpdatedAtMs = nil
      error = nil
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { self.error = error.localizedDescription }
  }

  private func loadSearch(_ text: String) async {
    source = .search
    isLoading = true; isFetching = true
    defer { isLoading = false; isFetching = false }
    do {
      let key = QueryCache.Key("coins-search", text, String(Self.searchLimit))
      let summaries = try await cache.fetch(key, policy: .search) { [market] in try await market.searchCoins(query: text, limit: Self.searchLimit) }
      guard !Task.isCancelled else { return }
      let ids = summaries.map(\.coingeckoId)
      let quotes: [String: CoinQuote] = ids.isEmpty ? [:] : try await cache.fetch(.init("coingecko-quotes", ids.sorted().joined(separator: ",")), policy: .quotes) { [market] in try await market.quotes(ids: ids).data }
      guard !Task.isCancelled else { return }
      rows = summaries.map { s in
        let qte = quotes[s.coingeckoId]
        return ScreenerMarketRow(coingeckoId: s.coingeckoId, symbol: s.symbol, name: s.name, image: s.logoUrl.isEmpty ? (qte?.image ?? "") : s.logoUrl,
                                 currentPrice: qte?.currentPrice, marketCap: qte?.marketCap, marketCapRank: qte?.marketCapRank.map(Double.init),
                                 totalVolume: qte?.totalVolume, priceChangePercentage24h: qte?.priceChangePercentage24h)
      }
      coverage = nil; screenUserMessage = nil; lastUpdatedAtMs = nil; error = nil
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { self.error = error.localizedDescription }
  }

  private func loadBrowse(force: Bool) async {
    source = .browse
    isLoading = rows.isEmpty; isFetching = true
    defer { isLoading = false; isFetching = false }
    do {
      let key = QueryCache.Key("screener", "top-markets", String(Self.browseLimit))
      let top = try await cache.fetch(key, policy: .screenerTop, force: force) { [market] in try await market.topMarkets(limit: Self.browseLimit) }
      guard !Task.isCancelled else { return }
      rows = top.map(\.screenerRow)
      coverage = nil; screenUserMessage = nil; error = nil
      lastUpdatedAtMs = top.compactMap(\.updatedAt).max()
      await refreshTaker(force: false)
    } catch is CancellationError {
    } catch { self.error = error.localizedDescription }
  }

  private func refreshTaker(force: Bool) async {
    let coins = rows.filter { !$0.symbol.isEmpty }.prefix(500).map { ScreenerAPI.TakerCoin(coingeckoId: $0.coingeckoId, symbol: $0.symbol.uppercased()) }
    let key = coins.map(\.coingeckoId).sorted().joined(separator: ",")
    guard !coins.isEmpty else { takerById = [:]; return }
    if key == takerKey && !force { return }
    takerKey = key
    takerTask?.cancel()
    takerLoading = takerById.isEmpty
    takerTask = Task { [weak self] in
      guard let self else { return }
      defer { takerLoading = false }
      do {
        let response = try await cache.fetch(.init("screener", "taker-flow", key), policy: .takerFlow, force: force) { [api] in try await api.takerMetrics(coins: Array(coins), range: "24h") }
        guard !Task.isCancelled else { return }
        var out: [String: TakerFlowMetrics] = [:]
        for (id, m) in response.byId { if let m { out[id] = m } }
        takerById = out
      } catch {}
    }
  }

  // MARK: Smart prompt

  /// `interpret.run`: NL → unified endpoint; on `ok` seed the execute cache and apply the DSL.
  func interpret(_ text: String) async -> ScreenResponse? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return nil }
    isInterpreting = true
    defer { isInterpreting = false }
    do {
      let response = try await api.screen(ScreenRequest(text: trimmed))
      if response.ok {
        await cache.set(.init("screener", "execute", ScreenerUrlCodec.canonicalKey(response.dsl)), value: response)
        applyScreen(response.dsl)
      }
      return response
    } catch {
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
