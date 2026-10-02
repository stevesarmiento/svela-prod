import Foundation

/// 1:1 Codable ports of `apps/app/src/lib/effect/coingecko-api.ts`.
/// Nullable numerics stay optional: `nil` ≠ 0 (`apps/app/src/types/coins.ts`).

public struct MarketChartPoint: Codable, Sendable, Hashable {
  public var time: Double
  public var value: Double
}

public struct ChartStatus: Codable, Sendable, Hashable {
  public var cached: Bool?
  public var stale: Bool?
  public var warmupRequested: Bool?
  public var warming: Bool?
  public var coverage: String?
  public var lastFetchedAt: Double?
  public var points: Double?
  public var lastUpdated: Double?

  /// Web: `warmupRequested || warming || stale`.
  public var needsWarmup: Bool { (warmupRequested ?? false) || (warming ?? false) || (stale ?? false) }
}

public struct MarketChartResponse: Codable, Sendable, Hashable {
  public struct Series: Codable, Sendable, Hashable {
    public var prices: [MarketChartPoint]
    public var volumes: [MarketChartPoint]
    public var market_caps: [MarketChartPoint]
  }
  public var data: Series
  public var status: ChartStatus?
}

/// `/api/coingecko/market-chart/batch` — one round trip for a watchlist. Each coin is the same
/// `{ data, status }` payload as the single-coin route so it can seed per-coin cache entries.
public struct MarketChartBatchResponse: Codable, Sendable, Hashable {
  public var results: [String: MarketChartResponse]
  public var failed: [String]
  public init(results: [String: MarketChartResponse], failed: [String] = []) { self.results = results; self.failed = failed }
}

public extension MarketChartResponse {
  /// The trailing `days` of a longer response. CoinGecko samples 2–90 day windows hourly, so a
  /// 30-day series is an exact clip of the cached 90-day one and needs no extra request.
  func clipped(toLastDays days: Int) -> MarketChartResponse {
    func seconds(_ t: Double) -> Double { t > 1e10 ? t / 1000 : t }
    guard let last = data.prices.last.map({ seconds($0.time) }) else { return self }
    let start = last - Double(days) * 86_400
    func clip(_ points: [MarketChartPoint]) -> [MarketChartPoint] {
      guard let first = points.firstIndex(where: { seconds($0.time) >= start }) else { return [] }
      return Array(points[first...])
    }
    var out = self
    out.data = Series(prices: clip(data.prices), volumes: clip(data.volumes), market_caps: clip(data.market_caps))
    out.status?.points = Double(out.data.prices.count)
    return out
  }
}

public struct GlobalMarketCapResponse: Codable, Sendable, Hashable {
  public struct Series: Codable, Sendable, Hashable {
    public var market_cap: [MarketChartPoint]
    public var volume: [MarketChartPoint]
  }
  public var data: Series
  public var status: ChartStatus?
}

public struct OHLCPoint: Codable, Sendable, Hashable {
  public var timestamp: Double
  public var open: Double
  public var high: Double
  public var low: Double
  public var close: Double
}

public struct OHLCResponse: Codable, Sendable, Hashable {
  public var data: [OHLCPoint]
  public var cached: Bool?
  public var status: ChartStatus?
}

/// `CoinGeckoQuoteMarketData`
public struct CoinQuote: Codable, Sendable, Hashable, Identifiable {
  public var id: String
  public var name: String
  public var symbol: String
  public var marketCapRank: Int?
  public var image: String
  public var sparkline7d: [Double]?
  public var currentPrice: Double?
  public var marketCap: Double?
  public var totalVolume: Double?
  public var priceChangePercentage24h: Double?
  public var priceChangePercentage1h: Double?
  public var priceChangePercentage7d: Double?
  public var priceChangePercentage30d: Double?
  public var circulatingSupply: Double?
  public var maxSupply: Double?
  public var lastUpdated: String?

  enum CodingKeys: String, CodingKey {
    case id, name, symbol, image, sparkline7d
    case marketCapRank = "market_cap_rank"
    case currentPrice = "current_price"
    case marketCap = "market_cap"
    case totalVolume = "total_volume"
    case priceChangePercentage24h = "price_change_percentage_24h"
    case priceChangePercentage1h = "price_change_percentage_1h_in_currency"
    case priceChangePercentage7d = "price_change_percentage_7d_in_currency"
    case priceChangePercentage30d = "price_change_percentage_30d_in_currency"
    case circulatingSupply = "circulating_supply"
    case maxSupply = "max_supply"
    case lastUpdated = "last_updated"
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    name = try c.decode(String.self, forKey: .name)
    symbol = try c.decode(String.self, forKey: .symbol)
    image = try c.decodeIfPresent(String.self, forKey: .image) ?? ""
    // rank arrives as a JSON number; tolerate fractional encodings.
    marketCapRank = (try c.decodeIfPresent(Double.self, forKey: .marketCapRank)).map { Int($0) }
    sparkline7d = try c.decodeIfPresent([Double].self, forKey: .sparkline7d)
    currentPrice = try c.decodeIfPresent(Double.self, forKey: .currentPrice)
    marketCap = try c.decodeIfPresent(Double.self, forKey: .marketCap)
    totalVolume = try c.decodeIfPresent(Double.self, forKey: .totalVolume)
    priceChangePercentage24h = try c.decodeIfPresent(Double.self, forKey: .priceChangePercentage24h)
    priceChangePercentage1h = try c.decodeIfPresent(Double.self, forKey: .priceChangePercentage1h)
    priceChangePercentage7d = try c.decodeIfPresent(Double.self, forKey: .priceChangePercentage7d)
    priceChangePercentage30d = try c.decodeIfPresent(Double.self, forKey: .priceChangePercentage30d)
    circulatingSupply = try c.decodeIfPresent(Double.self, forKey: .circulatingSupply)
    maxSupply = try c.decodeIfPresent(Double.self, forKey: .maxSupply)
    lastUpdated = try c.decodeIfPresent(String.self, forKey: .lastUpdated)
  }

  public init(id: String, name: String, symbol: String, image: String = "", marketCapRank: Int? = nil,
              currentPrice: Double? = nil, marketCap: Double? = nil, totalVolume: Double? = nil,
              priceChangePercentage24h: Double? = nil, sparkline7d: [Double]? = nil, lastUpdated: String? = nil) {
    self.id = id; self.name = name; self.symbol = symbol; self.image = image; self.marketCapRank = marketCapRank
    self.currentPrice = currentPrice; self.marketCap = marketCap; self.totalVolume = totalVolume
    self.priceChangePercentage24h = priceChangePercentage24h; self.sparkline7d = sparkline7d; self.lastUpdated = lastUpdated
  }

  public var lastUpdatedDate: Date? {
    guard let lastUpdated else { return nil }
    return (try? Date(lastUpdated, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
      ?? (try? Date(lastUpdated, strategy: Date.ISO8601FormatStyle()))
  }

  /// USD move over 24h derived from price + percent.
  public var usdMove24h: Double? {
    guard let p = currentPrice, let pct = priceChangePercentage24h, pct.isFinite else { return nil }
    let d = 1 + pct / 100
    return d == 0 ? nil : p - p / d
  }
}

public struct CoinQuotesStatus: Codable, Sendable, Hashable {
  public var timestamp: String?
  public var error_code: Double?
  public var error_message: String?
}

/// `/api/coingecko/quotes` → `{ data: Record<id, CoinQuote>, status? }`
public struct CoinQuotesResponse: Codable, Sendable, Hashable {
  public var data: [String: CoinQuote]
  public var status: CoinQuotesStatus?
  public init(data: [String: CoinQuote], status: CoinQuotesStatus? = nil) { self.data = data; self.status = status }
}

/// `CoinGeckoMarketRow` (`/api/coingecko/markets`)
public struct CoinMarketRow: Codable, Sendable, Hashable, Identifiable {
  public var id: String
  public var name: String
  public var symbol: String
  public var image: String?
  public var current_price: Double?
  public var market_cap: Double?
  public var market_cap_rank: Double?
  public var total_volume: Double?
  public var price_change_percentage_24h: Double?
  public var fully_diluted_valuation: Double?
  public var last_updated: String?
}

public struct CoinMarketsResponse: Codable, Sendable, Hashable {
  public var data: [CoinMarketRow]
}
