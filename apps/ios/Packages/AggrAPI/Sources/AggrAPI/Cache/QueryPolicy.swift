import Foundation

/// TanStack-style freshness policy. Values copied from the web hooks.
public struct QueryPolicy: Sendable, Hashable {
  public var staleTime: Duration
  public var refetchInterval: Duration?
  public var gcTime: Duration
  public var refetchOnForeground: Bool

  public init(staleTime: Duration, refetchInterval: Duration? = nil, gcTime: Duration = .seconds(86_400), refetchOnForeground: Bool = true) {
    self.staleTime = staleTime; self.refetchInterval = refetchInterval; self.gcTime = gcTime; self.refetchOnForeground = refetchOnForeground
  }

  public static let quotes = QueryPolicy(staleTime: .seconds(30), refetchInterval: .seconds(300))                 // use-coingecko-quotes
  public static let chart = QueryPolicy(staleTime: .seconds(120), refetchInterval: .seconds(120))                 // use-coingecko-chart-data
  public static let aggregateChart = QueryPolicy(staleTime: .seconds(300), refetchInterval: .seconds(300))        // watchlist aggregate
  public static let globalMarketCap = QueryPolicy(staleTime: .seconds(600), refetchInterval: .seconds(1800))      // use-global-market-cap-over-time
  public static let holdingsValue = QueryPolicy(staleTime: .seconds(600), refetchInterval: .seconds(1800))        // use-holdings-value-over-time
  public static let screenerTop = QueryPolicy(staleTime: .seconds(3600), refetchInterval: .seconds(3600))         // use-screener-top-markets
  public static let takerFlow = QueryPolicy(staleTime: .seconds(600), refetchInterval: .seconds(900))             // use-screener-taker-flow / taker-buy-sell
  public static let openInterest = QueryPolicy(staleTime: .seconds(600), refetchInterval: .seconds(900))          // use-open-interest
  public static let liquidations = QueryPolicy(staleTime: .seconds(300), refetchInterval: nil, gcTime: .seconds(600), refetchOnForeground: false)
  public static let search = QueryPolicy(staleTime: .seconds(600))                                                // use-hybrid-coin-search
  public static let topCoins = QueryPolicy(staleTime: .seconds(3600), refetchInterval: .seconds(3600))
  public static let screenResults = QueryPolicy(staleTime: .seconds(60))                                          // use-screener-results
  public static let tokenHeader = QueryPolicy(staleTime: .seconds(600))                                           // use-token-header
  public static let defaults = QueryPolicy(staleTime: .seconds(300))                                              // providers.tsx
}
