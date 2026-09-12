import Foundation

/// Typed endpoints over ``APIClient`` mirroring `CoinGeckoApi` + `CoinsInternalApi`.
public struct MarketAPI: Sendable {
  public let client: APIClient
  public init(client: APIClient) { self.client = client }

  // MARK: CoinGecko (`/api/coingecko/*`)

  /// `getQuotes` — `ids` joined by comma; `sparkline=true` adds `sparkline7d`.
  public func quotes(ids: [String] = [], symbols: [String] = [], limit: Int? = nil, sparkline: Bool = false) async throws -> CoinQuotesResponse {
    var q: [URLQueryItem] = []
    if !ids.isEmpty { q.append(.init(name: "ids", value: ids.joined(separator: ","))) }
    if !symbols.isEmpty { q.append(.init(name: "symbols", value: symbols.joined(separator: ","))) }
    if let limit { q.append(.init(name: "limit", value: String(limit))) }
    if sparkline { q.append(.init(name: "sparkline", value: "true")) }
    // Route has maxDuration 30 and may fall through to live CoinGecko.
    return try await client.get("/api/coingecko/quotes", query: q, timeout: 20, requiresAuth: true)
  }

  public func marketChart(coinId: String, days: String, vsCurrency: String? = nil) async throws -> MarketChartResponse {
    var q = [URLQueryItem(name: "id", value: coinId), URLQueryItem(name: "days", value: days)]
    if let vsCurrency { q.append(.init(name: "vs_currency", value: vsCurrency)) }
    return try await client.get("/api/coingecko/market-chart", query: q)
  }

  public func ohlc(coinId: String, days: String, precision: String? = nil) async throws -> OHLCResponse {
    var q = [URLQueryItem(name: "id", value: coinId), URLQueryItem(name: "days", value: days)]
    if let precision { q.append(.init(name: "precision", value: precision)) }
    return try await client.get("/api/coingecko/ohlc", query: q)
  }

  public func globalMarketCap(days: String) async throws -> GlobalMarketCapResponse {
    try await client.get("/api/coingecko/global-market-cap", query: [.init(name: "days", value: days)])
  }

  public func markets(ids: [String]) async throws -> CoinMarketsResponse {
    try await client.get("/api/coingecko/markets", query: [.init(name: "ids", value: ids.joined(separator: ","))])
  }

  // MARK: Coins internal (`/api/internal/*`, unauthenticated)

  public func searchCoins(query: String, limit: Int? = nil) async throws -> [CoinSummary] {
    let trimmed = query.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return [] }
    var q = [URLQueryItem(name: "query", value: trimmed)]
    if let limit { q.append(.init(name: "limit", value: String(limit))) }
    return try await client.get("/api/internal/coins/search", query: q, requiresAuth: false)
  }

  public func topCoins(limit: Int? = nil) async throws -> [CoinSummary] {
    var q: [URLQueryItem] = []
    if let limit { q.append(.init(name: "limit", value: String(limit))) }
    return try await client.get("/api/internal/coins/top", query: q, requiresAuth: false)
  }

  public func coinMeta(id: String) async throws -> CoinMeta? {
    let path = "/api/internal/coins/coingecko/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)"
    return try await client.get(path, requiresAuth: false)
  }

  public func topMarkets(limit: Int? = nil) async throws -> [TopMarketRow] {
    var q: [URLQueryItem] = []
    if let limit { q.append(.init(name: "limit", value: String(limit))) }
    return try await client.get("/api/internal/markets/top", query: q, timeout: 15, requiresAuth: false)
  }
}
