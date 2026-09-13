#if DEBUG
import AggrAPI
import AggrCore
import Foundation

/// Pure fixtures are nonisolated so URLSession's protocol can read them off the main actor.
nonisolated enum PreviewFixtures {
  static let now = Int(Date().timeIntervalSince1970)
  static let quotes: [CoinQuote] = [
    CoinQuote(id: "bitcoin", name: "Bitcoin", symbol: "BTC", marketCapRank: 1, currentPrice: 67_420, marketCap: 1_330_000_000_000, totalVolume: 28_600_000_000, priceChangePercentage24h: 2.84, sparkline7d: line.map(\.value)),
    CoinQuote(id: "ethereum", name: "Ethereum", symbol: "ETH", marketCapRank: 2, currentPrice: 3_480, marketCap: 418_000_000_000, totalVolume: 12_400_000_000, priceChangePercentage24h: -1.32, sparkline7d: line.reversed().map(\.value)),
    CoinQuote(id: "solana", name: "Solana", symbol: "SOL", marketCapRank: 5, currentPrice: 148.60, marketCap: 68_000_000_000, totalVolume: 3_100_000_000, priceChangePercentage24h: 6.12, sparkline7d: line.map(\.value))
  ]
  static let group = WatchlistGroup(id: "preview-core", userId: "preview-user", name: "Core holdings", slug: "core-holdings", description: "Long-term watchlist", icon: "wallet", color: "blue", isDefault: true)
  static let secondGroup = WatchlistGroup(id: "preview-growth", userId: "preview-user", name: "On my radar", slug: "on-my-radar", icon: "sparkles", color: "purple")
  static let items = [
    WatchlistItem(id: "preview-btc", watchlistGroupId: group.id, coinId: "bitcoin", holdings: 0.65),
    WatchlistItem(id: "preview-eth", watchlistGroupId: group.id, coinId: "ethereum", holdings: 4.2),
    WatchlistItem(id: "preview-sol", watchlistGroupId: group.id, coinId: "solana", holdings: 25)
  ]
  static let bootstrap = WatchlistsPageBootstrap(groups: [group, secondGroup], defaultGroup: group,
    itemsByGroupId: [group.id: items, secondGroup.id: [WatchlistItem(id: "preview-radar-sol", watchlistGroupId: secondGroup.id, coinId: "solana")]])

  // 400 hourly bars provide enough history for all four indicators without random canvas changes.
  static let line: [TimePoint] = (0..<400).map { i in
    let x = Double(i)
    let value = 61_000 + x * 15 + sin(x / 9) * 1_100 + cos(x / 23) * 750
    return TimePoint(epochSeconds: now - (399 - i) * 3_600, value: value)
  }
  static let bars: [OHLCVBar] = line.enumerated().map { i, p in
    OHLCVBar(time: p.epochSeconds, open: p.value - 100, high: p.value + 300, low: p.value - 350,
             close: p.value, volume: 80_000_000 + Double(i % 17) * 4_000_000)
  }
  static let chart = ParsedChartData(line: line, volume: bars.map { TimePoint(epochSeconds: $0.time, value: $0.volume) },
    ohlc: bars, marketCap: line.map { TimePoint(epochSeconds: $0.epochSeconds, value: $0.value * 19_700_000) })
  static let indicators = IndicatorBundle.compute(bars: bars, scale: .d30)!
  static let returns = line.map { TimePoint(epochSeconds: $0.epochSeconds, value: ($0.value / line[0].value - 1) * 100) }
  static let overview: OverviewBootstrap = decode(overviewJSON(empty: false))
  static let event: OverviewEvent = decode(eventJSON)
  static let articles: [NewsArticle] = decode(articleJSON)
  static let marketRows: [TopMarketRow] = decode(topRowsJSON)

  static func data(_ object: Any) -> Data { try! JSONSerialization.data(withJSONObject: object, options: [.fragmentsAllowed, .sortedKeys]) }
  static func object<T: Encodable>(_ value: T) -> Any { try! JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: .fragmentsAllowed) }
  static func decode<T: Decodable>(_ object: Any) -> T { try! JSONDecoder().decode(T.self, from: data(object)) }

  static var eventJSON: [String: Any] { [
    "id": "preview-news", "articleId": "preview-article", "kind": "news", "tone": "positive", "sentiment": "bullish",
    "occurredAtMs": Double(now - 1800) * 1000, "coingeckoId": "bitcoin", "name": "Bitcoin", "symbol": "BTC",
    "title": "Sample market update", "aiSummary": "Bitcoin volume rises as the broader market steadies. Fictional news for preview layout.",
    "tokenHref": "/watchlists/bitcoin"
  ] }
  static var articleJSON: [[String: Any]] { [
    ["articleId": "preview-article", "title": "Sample market update", "url": "https://example.com", "sourceName": "Preview News",
     "postedAtMs": Double(now - 1800) * 1000, "sentiment": "bullish", "aiSummary": "A fictional update for checking news cards and text wrapping."],
    ["articleId": "preview-article-2", "title": "Traders watch the next move", "url": "https://example.com", "sourceName": "Sample Daily",
     "postedAtMs": Double(now - 7200) * 1000, "sentiment": "neutral"]
  ] }
  static var holdingsJSON: [[String: Any]] { [["group": object(group), "positions": items.map { ["coinId": $0.coinId, "holdings": $0.holdings ?? 0] }, "totalHoldings": 29.85, "coinsWithHoldings": 3]] }
  static func overviewJSON(empty: Bool) -> [String: Any] {
    ["status": "fresh", "generatedAt": Double(now) * 1000, "watchlistCoinCount": empty ? 0 : 3, "limited": false,
     "holdingsBreakdown": empty ? [] : holdingsJSON,
     "events": ["generatedAt": Double(now) * 1000, "coinCount": empty ? 0 : 3, "limited": false, "events": empty ? [] : [eventJSON]]]
  }
  static var topRowsJSON: [[String: Any]] { quotes.map { q in
    ["coingeckoId": q.id, "name": q.name, "symbol": q.symbol, "image": "", "currentPrice": q.currentPrice!,
     "marketCap": q.marketCap!, "marketCapRank": q.marketCapRank!, "totalVolume": q.totalVolume!,
     "priceChangePercentage24h": q.priceChangePercentage24h!, "return7dPct": 5.2, "return30dPct": 12.4,
     "volatility7dPct": 3.1, "updatedAt": Double(now) * 1000]
  } }
  static func subscriptions(empty: Bool) -> [String: Data] {
    ["watchlists:getMyWatchlistsPageBootstrap": data(object(empty ? .empty : bootstrap)),
     "watchlists:listMyWatchlistGroups": data(empty ? [] : object(bootstrap.groups)),
     "watchlists:getMyAllWatchlistCoinIds": data(empty ? [] : quotes.map(\.id)),
     "overview:getMyOverviewBootstrap": data(overviewJSON(empty: empty)),
     "watchlists:getMyHoldingsBreakdownByWatchlistGroup": data(empty ? [] : holdingsJSON),
     "overview:getNewsSentimentOverlay": data([]),
     "coingeckoNews:listNewsByCoinId": data(empty ? [] : articleJSON)]
  }

  static func response(for url: URL) -> Data? {
    let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let id = query.first { $0.name == "id" }?.value ?? "bitcoin"
    let price = quotes.first { $0.id == id }?.currentPrice ?? 67_420
    let factor = price / 67_420
    func points(_ multiplier: Double) -> [[String: Double]] {
      // The web market-chart endpoints already normalize their `time` values to seconds.
      line.map { ["time": Double($0.epochSeconds), "value": $0.value * multiplier] }
    }
    switch url.path {
    case "/api/coingecko/quotes": return data(["data": object(Dictionary(uniqueKeysWithValues: quotes.map { ($0.id, $0) }))])
    case "/api/coingecko/market-chart": return data(["data": ["prices": points(factor), "volumes": points(1_500), "market_caps": points(19_700_000 * factor)]])
    case "/api/coingecko/global-market-cap": return data(["data": ["market_cap": points(40_000_000), "volume": points(2_000_000)]])
    case "/api/coingecko/ohlc": return data(["data": bars.map { ["timestamp": Double($0.time) * 1000, "open": $0.open * factor, "high": $0.high * factor, "low": $0.low * factor, "close": $0.close * factor] }])
    case "/api/coingecko/markets": return data(["data": object(quotes)])
    case "/api/internal/coins/top", "/api/internal/coins/search":
      let search = query.first { $0.name == "query" }?.value?.lowercased() ?? ""
      return data(quotes.filter { search.isEmpty || ($0.name + $0.symbol).lowercased().contains(search) }.map { ["coingeckoId": $0.id, "name": $0.name, "symbol": $0.symbol, "logoUrl": ""] })
    case "/api/internal/markets/top": return data(topRowsJSON)
    case "/api/smart-screener/taker-metrics": return data(["success": true, "byId": [:]])
    default:
      if url.path.hasPrefix("/api/internal/coins/coingecko/"), let q = quotes.first(where: { $0.id == url.lastPathComponent }) {
        return data(["coingeckoId": q.id, "name": q.name, "symbol": q.symbol, "logoUrl": ""])
      }
      return nil
    }
  }
}

/// Session-local interception: every request is handled here, including unknown endpoints.
/// No fallback to the network, auth token lookup, or production writes is possible.
nonisolated final class PreviewURLProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    guard let url = request.url else { client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return }
    let fixture = PreviewFixtures.response(for: url)
    let body = fixture ?? PreviewFixtures.data(["error": "This action is unavailable in an offline preview."])
    let response = HTTPURLResponse(url: url, statusCode: fixture == nil ? 400 : 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: body)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
#endif
