import Foundation

/// 1:1 ports of the response schemas in `lib/effect/coinglass-api.ts` (served by `/api/coinglass/*`).

public struct CoinGlassCoinInfo: Codable, Sendable, Hashable {
  public var symbol: String
  public var name: String
  public var coinId: Double
  public var isSupported: Bool
}

public struct OpenInterestPoint: Codable, Sendable, Hashable {
  public var timestamp: Double
  public var open: Double
  public var high: Double
  public var low: Double
  public var close: Double
}

public struct OpenInterestResponse: Codable, Sendable {
  public var success: Bool
  public var data: [OpenInterestPoint]
  public var count: Double
  public var symbol: String
  public var interval: String
  public var unit: String
  public var originalInput: String
  public var coinInfo: CoinGlassCoinInfo?
  public var lastUpdated: String

  /// `(latest.close - prev.close) / prev.close * 100` — mirrors `use-analysis-data.ts`.
  public var changePct: Double? {
    guard data.count >= 2 else { return nil }
    let last = data[data.count - 1].close, prev = data[data.count - 2].close
    return prev != 0 ? (last - prev) / prev * 100 : nil
  }
}

public struct TakerBuySellExchange: Codable, Sendable, Hashable {
  public var exchange: String
  public var buyRatio: Double
  public var sellRatio: Double
  public var buyVolumeUsd: Double
  public var sellVolumeUsd: Double
  public var totalVolumeUsd: Double
}

public struct TakerBuySellOverall: Codable, Sendable, Hashable {
  public var buyRatio: Double
  public var sellRatio: Double
  public var buyVolumeUsd: Double
  public var sellVolumeUsd: Double
  public var totalVolumeUsd: Double
}

public struct TakerBuySellData: Codable, Sendable, Hashable {
  public var symbol: String
  public var overall: TakerBuySellOverall
  public var exchanges: [TakerBuySellExchange]
}

public struct TakerBuySellResponse: Codable, Sendable {
  public var success: Bool
  public var data: TakerBuySellData
  public var range: String
  public var symbol: String
  public var originalInput: String
  public var coinInfo: CoinGlassCoinInfo?
  public var lastUpdated: String

  /// Same "meaningful" gate as the web: positive total volume and at least one exchange row.
  public var meaningfulOverall: TakerBuySellOverall? {
    data.overall.totalVolumeUsd > 0 && !data.exchanges.isEmpty ? data.overall : nil
  }
}

public struct LiquidationHistoryItem: Codable, Sendable, Hashable {
  public var timestamp: Double
  public var date: String
  public var longLiquidations: Double
  public var shortLiquidations: Double
  public var totalLiquidations: Double
}

public struct LiquidationHistoryResponse: Codable, Sendable {
  public var success: Bool
  public var data: [LiquidationHistoryItem]
  public var count: Double
  public var symbol: String
  public var originalInput: String
  public var coinInfo: CoinGlassCoinInfo?
  public var interval: String
  public var exchangeList: String
  public var lastUpdated: String
}
