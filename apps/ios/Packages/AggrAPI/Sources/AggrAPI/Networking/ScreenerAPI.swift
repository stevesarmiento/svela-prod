import AggrCore
import Foundation

/// `ScreenerApi` (`lib/effect/screener-api.ts`): unified screen endpoint (30s timeout — may run an LLM pass)
/// and batched taker metrics.
public struct ScreenerAPI: Sendable {
  public let client: APIClient
  public init(client: APIClient) { self.client = client }

  public enum ScreenOutcome: Sendable {
    /// Parsed response (`ok` may be false — the dialog renders `userMessage`).
    case response(ScreenResponse)
  }

  /// Exactly one of `text` / `dsl`. Never retried (LLM budget).
  public func screen(_ request: ScreenRequest) async throws -> ScreenResponse {
    try await client.post("/api/smart-screener/screen", body: request, timeout: 30, retries: 0, requiresAuth: true)
  }

  public struct TakerCoin: Encodable, Sendable { public var coingeckoId: String; public var symbol: String; public init(coingeckoId: String, symbol: String) { self.coingeckoId = coingeckoId; self.symbol = symbol } }
  private struct TakerBody: Encodable { var coins: [TakerCoin]; var range: String; var exchange: String? }

  /// ONE batched request for the whole table (≤500 coins, joined by coingeckoId).
  public func takerMetrics(coins: [TakerCoin], range: String = "24h", exchange: String? = nil) async throws -> TakerMetricsResponse {
    guard !coins.isEmpty else { return TakerMetricsResponse(success: true, byId: [:]) }
    return try await client.post("/api/smart-screener/taker-metrics", body: TakerBody(coins: Array(coins.prefix(500)), range: range, exchange: exchange), timeout: 15, retries: 1, requiresAuth: true)
  }
}

extension TopMarketRow {
  /// Bridge `/api/internal/markets/top` rows into the screener row shape.
  public var screenerRow: ScreenerMarketRow {
    ScreenerMarketRow(coingeckoId: coingeckoId, symbol: symbol, name: name, image: image, currentPrice: currentPrice, marketCap: marketCap,
                      marketCapRank: marketCapRank, fullyDilutedValuation: fullyDilutedValuation, totalVolume: totalVolume, high24h: high24h, low24h: low24h,
                      priceChange24h: priceChange24h, priceChangePercentage24h: priceChangePercentage24h, marketCapChange24h: marketCapChange24h,
                      marketCapChangePercentage24h: marketCapChangePercentage24h, circulatingSupply: circulatingSupply, totalSupply: totalSupply, maxSupply: maxSupply,
                      ath: ath, athChangePercentage: athChangePercentage, atl: atl, atlChangePercentage: atlChangePercentage, return7dPct: return7dPct,
                      return30dPct: return30dPct, volatility7dPct: volatility7dPct, updatedAt: updatedAt)
  }
}
