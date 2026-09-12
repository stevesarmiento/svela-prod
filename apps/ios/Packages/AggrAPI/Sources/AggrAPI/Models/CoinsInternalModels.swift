import Foundation

/// Ports of `apps/app/src/lib/effect/coins-internal-api.ts`.

/// `/api/internal/coins/search` + `/api/internal/coins/top` rows (full `coingeckoCoins` docs).
public struct CoinSummary: Codable, Sendable, Hashable, Identifiable {
  public var coingeckoId: String
  public var name: String
  public var symbol: String
  public var logoUrl: String
  public var id: String { coingeckoId }

  public init(coingeckoId: String, name: String, symbol: String, logoUrl: String) {
    self.coingeckoId = coingeckoId; self.name = name; self.symbol = symbol; self.logoUrl = logoUrl
  }

  enum CodingKeys: String, CodingKey { case coingeckoId, name, symbol, logoUrl }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    coingeckoId = try c.decode(String.self, forKey: .coingeckoId)
    name = try c.decode(String.self, forKey: .name)
    symbol = try c.decode(String.self, forKey: .symbol)
    logoUrl = try c.decodeIfPresent(String.self, forKey: .logoUrl) ?? ""
  }
}

/// `/api/internal/markets/top` rows (full `coingeckoMarkets` docs; only identity fields guaranteed).
public struct TopMarketRow: Codable, Sendable, Hashable, Identifiable {
  public var coingeckoId: String
  public var symbol: String
  public var name: String
  public var image: String
  public var currentPrice: Double?
  public var marketCap: Double?
  public var marketCapRank: Double?
  public var totalVolume: Double?
  public var priceChangePercentage24h: Double?
  public var fullyDilutedValuation: Double?
  public var high24h: Double?
  public var low24h: Double?
  public var priceChange24h: Double?
  public var marketCapChange24h: Double?
  public var marketCapChangePercentage24h: Double?
  public var ath: Double?
  public var athChangePercentage: Double?
  public var atl: Double?
  public var atlChangePercentage: Double?
  public var circulatingSupply: Double?
  public var totalSupply: Double?
  public var maxSupply: Double?
  public var return7dPct: Double?
  public var return30dPct: Double?
  public var volatility7dPct: Double?
  public var updatedAt: Double?
  public var id: String { coingeckoId }
}

/// `/api/internal/coins/coingecko/[id]` → `CoinMeta | null`
public struct CoinMeta: Codable, Sendable, Hashable, Identifiable {
  public var coingeckoId: String
  public var name: String
  public var symbol: String
  public var logoUrl: String
  public var id: String { coingeckoId }

  enum CodingKeys: String, CodingKey { case coingeckoId, name, symbol, logoUrl }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    coingeckoId = try c.decode(String.self, forKey: .coingeckoId)
    name = try c.decode(String.self, forKey: .name)
    symbol = try c.decode(String.self, forKey: .symbol)
    logoUrl = try c.decodeIfPresent(String.self, forKey: .logoUrl) ?? ""
  }
}
