import Foundation

/// Ports of `metric-catalog.ts`, `technical-metrics.ts`, `taker-metrics.ts`, `metric-registry.ts`.
public enum MetricUnit: String, Sendable, Codable { case usd, percent, ratio, rank, number }
public enum MetricSource: String, Sendable, Codable { case markets, taker }

/// `CoingeckoMarketRowLike`
public struct ScreenerMarketRow: Sendable, Hashable {
  public var coingeckoId: String
  public var symbol: String
  public var name: String
  public var image: String
  public var currentPrice: Double?
  public var marketCap: Double?
  public var marketCapRank: Double?
  public var fullyDilutedValuation: Double?
  public var totalVolume: Double?
  public var high24h: Double?
  public var low24h: Double?
  public var priceChange24h: Double?
  public var priceChangePercentage24h: Double?
  public var marketCapChange24h: Double?
  public var marketCapChangePercentage24h: Double?
  public var circulatingSupply: Double?
  public var totalSupply: Double?
  public var maxSupply: Double?
  public var ath: Double?
  public var athChangePercentage: Double?
  public var atl: Double?
  public var atlChangePercentage: Double?
  public var return7dPct: Double?
  public var return30dPct: Double?
  public var volatility7dPct: Double?
  public var updatedAt: Double?
  /// Screener response `metrics` (computed values for DSL metric ids).
  public var metrics: [String: Double?]?

  public init(coingeckoId: String, symbol: String, name: String, image: String, currentPrice: Double? = nil, marketCap: Double? = nil,
              marketCapRank: Double? = nil, fullyDilutedValuation: Double? = nil, totalVolume: Double? = nil, high24h: Double? = nil, low24h: Double? = nil,
              priceChange24h: Double? = nil, priceChangePercentage24h: Double? = nil, marketCapChange24h: Double? = nil, marketCapChangePercentage24h: Double? = nil,
              circulatingSupply: Double? = nil, totalSupply: Double? = nil, maxSupply: Double? = nil, ath: Double? = nil, athChangePercentage: Double? = nil,
              atl: Double? = nil, atlChangePercentage: Double? = nil, return7dPct: Double? = nil, return30dPct: Double? = nil, volatility7dPct: Double? = nil,
              updatedAt: Double? = nil, metrics: [String: Double?]? = nil) {
    self.coingeckoId = coingeckoId; self.symbol = symbol; self.name = name; self.image = image; self.currentPrice = currentPrice; self.marketCap = marketCap
    self.marketCapRank = marketCapRank; self.fullyDilutedValuation = fullyDilutedValuation; self.totalVolume = totalVolume; self.high24h = high24h; self.low24h = low24h
    self.priceChange24h = priceChange24h; self.priceChangePercentage24h = priceChangePercentage24h; self.marketCapChange24h = marketCapChange24h
    self.marketCapChangePercentage24h = marketCapChangePercentage24h; self.circulatingSupply = circulatingSupply; self.totalSupply = totalSupply; self.maxSupply = maxSupply
    self.ath = ath; self.athChangePercentage = athChangePercentage; self.atl = atl; self.atlChangePercentage = atlChangePercentage
    self.return7dPct = return7dPct; self.return30dPct = return30dPct; self.volatility7dPct = volatility7dPct; self.updatedAt = updatedAt; self.metrics = metrics
  }

  /// Web `isLoadingQuote`: no price yet → skeleton row.
  public var isLoadingQuote: Bool { (currentPrice ?? 0) <= 0 }
}

extension ScreenerMarketRow: Identifiable {
  public var id: String { coingeckoId }
}

/// `TakerScopedSnapshotLike`
public struct TakerSnapshot: Sendable, Hashable, Codable {
  public var buyRatio: Double
  public var sellRatio: Double
  public var buyVolumeUsd: Double
  public var sellVolumeUsd: Double
  public var totalVolumeUsd: Double
  public init(buyRatio: Double, sellRatio: Double, buyVolumeUsd: Double, sellVolumeUsd: Double, totalVolumeUsd: Double) {
    self.buyRatio = buyRatio; self.sellRatio = sellRatio; self.buyVolumeUsd = buyVolumeUsd; self.sellVolumeUsd = sellVolumeUsd; self.totalVolumeUsd = totalVolumeUsd
  }
}

public struct MetricDefinition: Sendable, Identifiable {
  public let id: String
  public let label: String
  public let unit: MetricUnit
  public let synonyms: [String]
  public let description: String?
  public let source: MetricSource
  public let allowNegative: Bool
  public let marketValue: (@Sendable (ScreenerMarketRow) -> Double?)?
  public let takerValue: (@Sendable (TakerSnapshot) -> Double?)?

  public enum Group: String, Sendable, CaseIterable { case market = "Market", technical = "Technical", derivatives = "Derivatives" }
  public let group: Group
}

public enum MetricCatalog {
  static func fin(_ v: Double?) -> Double? { v.flatMap { $0.isFinite ? $0 : nil } }

  static func pctChange(current: Double?, reference: Double?, drawdown: Bool) -> Double? {
    guard let c = fin(current), let r = fin(reference), r > 0 else { return nil }
    return drawdown ? (r - c) / r * 100 : (c - r) / r * 100
  }

  static func pctRange(high: Double?, low: Double?, current: Double?) -> Double? {
    guard let h = fin(high), let l = fin(low), let c = fin(current), c > 0, h >= l else { return nil }
    return (h - l) / c * 100
  }

  /// CoinGlass emits 0–100 scale; DSL ratio unit is 0..1. `> 1.5 → ÷100`.
  public static func normalizeTakerRatio(_ v: Double) -> Double? {
    guard v.isFinite else { return nil }
    return v > 1.5 ? v / 100 : v
  }

  static func m(_ id: String, _ label: String, _ unit: MetricUnit, _ syn: [String], desc: String? = nil, neg: Bool = false, group: MetricDefinition.Group = .market, _ get: @escaping @Sendable (ScreenerMarketRow) -> Double?) -> MetricDefinition {
    MetricDefinition(id: id, label: label, unit: unit, synonyms: syn, description: desc, source: .markets, allowNegative: neg, marketValue: get, takerValue: nil, group: group)
  }
  static func t(_ id: String, _ label: String, _ unit: MetricUnit, _ syn: [String], desc: String? = nil, neg: Bool = false, _ get: @escaping @Sendable (TakerSnapshot) -> Double?) -> MetricDefinition {
    MetricDefinition(id: id, label: label, unit: unit, synonyms: syn, description: desc, source: .taker, allowNegative: neg, marketValue: nil, takerValue: get, group: .derivatives)
  }

  public static let market: [MetricDefinition] = [
    m("price_usd", "Price", .usd, ["price", "spot price", "current price"]) { fin($0.currentPrice) },
    m("market_cap_usd", "Market cap", .usd, ["market cap", "marketcap", "mcap"]) { fin($0.marketCap) },
    m("volume_24h_usd", "24h volume", .usd, ["volume", "24h volume", "volume 24h"]) { fin($0.totalVolume) },
    m("fdv_usd", "FDV", .usd, ["fdv", "fully diluted valuation", "fully-diluted valuation"]) { fin($0.fullyDilutedValuation) },
    m("market_cap_rank", "Market cap rank", .rank, ["rank", "market rank", "market cap rank"]) { fin($0.marketCapRank) },
    m("price_change_24h_pct", "24h price change (%)", .percent, ["change 24h", "24h change", "price change 24h", "24h pct change", "24h %"], desc: "Percent points, e.g. 10 means +10%.") { fin($0.priceChangePercentage24h) },
    m("market_cap_change_24h_pct", "24h market cap change (%)", .percent, ["market cap change 24h", "mcap change 24h", "market cap % 24h"], desc: "Percent points, e.g. 10 means +10%.") { fin($0.marketCapChangePercentage24h) },
    m("price_change_24h_usd", "24h price change ($)", .usd, ["price change 24h usd", "24h price change usd", "price delta 24h"], neg: true) { fin($0.priceChange24h) },
    m("market_cap_change_24h_usd", "24h market cap change ($)", .usd, ["market cap change 24h usd", "mcap delta 24h", "market cap delta 24h"], neg: true) { fin($0.marketCapChange24h) },
    m("range_24h_pct", "24h range (%)", .percent, ["24h range", "range 24h", "high low range", "24h volatility"], desc: "(high24h - low24h) / currentPrice * 100") { pctRange(high: $0.high24h, low: $0.low24h, current: $0.currentPrice) },
    m("ath_drawdown_pct", "ATH drawdown (%)", .percent, ["drawdown from ath", "ath drawdown", "distance from ath"], desc: "(ath - currentPrice) / ath * 100 (positive means below ATH)") { pctChange(current: $0.currentPrice, reference: $0.ath, drawdown: true) },
    m("atl_upside_pct", "ATL upside (%)", .percent, ["upside from atl", "atl upside", "distance from atl"], desc: "(currentPrice - atl) / atl * 100") { pctChange(current: $0.currentPrice, reference: $0.atl, drawdown: false) },
  ]

  public static let technical: [MetricDefinition] = [
    m("return_7d_pct", "7d return (%)", .percent, ["7d return", "return 7d", "weekly return", "past week return"], group: .technical) { fin($0.return7dPct) },
    m("return_30d_pct", "30d return (%)", .percent, ["30d return", "return 30d", "monthly return", "past month return"], group: .technical) { fin($0.return30dPct) },
    m("volatility_7d_pct", "7d volatility (%)", .percent, ["7d volatility", "volatility 7d", "weekly volatility", "volatility squeeze", "coiled", "tight range", "consolidating", "vol 7d"], desc: "Stddev of log returns over the last 7d (percent points).", group: .technical) { fin($0.volatility7dPct) },
  ]

  public static let taker: [MetricDefinition] = [
    t("taker_buy_ratio", "Taker buy ratio", .ratio, ["buy ratio", "taker buy ratio", "buy pressure", "buy > sell", "buyers vs sellers"], desc: "Share of taker volume that is buys, 0..1 (0.55 means 55% buys).") { normalizeTakerRatio($0.buyRatio) },
    t("taker_buy_volume_usd", "Taker buy volume ($)", .usd, ["taker buy volume", "buy volume", "taker buys"]) { fin($0.buyVolumeUsd) },
    t("taker_sell_volume_usd", "Taker sell volume ($)", .usd, ["taker sell volume", "sell volume", "taker sells"]) { fin($0.sellVolumeUsd) },
    t("taker_total_volume_usd", "Taker total volume ($)", .usd, ["taker volume", "taker total volume", "derivatives volume"]) { fin($0.totalVolumeUsd) },
    t("taker_net_buy_usd", "Taker net buy ($)", .usd, ["net buy", "net buying", "net taker buy", "net inflow"], desc: "buyVolumeUsd - sellVolumeUsd; negative means net selling.", neg: true) { fin($0.buyVolumeUsd - $0.sellVolumeUsd) },
  ]

  public static let all: [MetricDefinition] = market + technical + taker
  public static let ids: [String] = all.map(\.id)
  static let byId: [String: MetricDefinition] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })

  public static func metric(_ id: String) -> MetricDefinition? { byId[id] }

  public static let takerRanges: [String] = ["1h", "4h", "12h", "24h", "7d"]
}
