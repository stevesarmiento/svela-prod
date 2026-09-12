import Foundation

/// `/api/coinglass/*` (authenticated, `market-data` limiter). Mirrors `lib/effect/coinglass-api.ts`.
public struct DerivativesAPI: Sendable {
  public let client: APIClient
  public init(client: APIClient) { self.client = client }

  public static let defaultLiquidationExchanges = "Binance, Bybit, OKX, Gate, HTX, Hyperliquid, CoinEx, Bitmex, Bitfinex"

  public func openInterest(symbol: String, interval: String = "4h", limit: Int = 50, unit: String = "usd") async throws -> OpenInterestResponse {
    try await client.get("/api/coinglass/open-interest/aggregated-history", query: [
      .init(name: "symbol", value: symbol), .init(name: "interval", value: interval),
      .init(name: "limit", value: String(limit)), .init(name: "unit", value: unit),
    ])
  }

  public func takerBuySell(symbol: String, range: String = "24h") async throws -> TakerBuySellResponse {
    try await client.get("/api/coinglass/taker-buy-sell/exchange-list", query: [
      .init(name: "symbol", value: symbol), .init(name: "range", value: range),
    ])
  }

  public func liquidationHistory(symbol: String, interval: String = "1d", exchangeList: String = defaultLiquidationExchanges, limit: Int = 7) async throws -> LiquidationHistoryResponse {
    try await client.get("/api/coinglass/liquidation/aggregated-history", query: [
      .init(name: "symbol", value: symbol), .init(name: "interval", value: interval),
      .init(name: "exchange_list", value: exchangeList), .init(name: "limit", value: String(limit)),
    ])
  }
}
