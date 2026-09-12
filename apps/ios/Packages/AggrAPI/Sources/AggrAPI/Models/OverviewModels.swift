import AggrCore
import Foundation

/// `overview:getMyOverviewBootstrap` and friends (`apps/app/convex/overview.ts`).
public struct OverviewHoldingsGroup: Codable, Sendable, Hashable {
  public struct Position: Codable, Sendable, Hashable { public var coinId: String; public var holdings: Double }
  public var group: WatchlistGroup
  public var positions: [Position]
  public var totalHoldings: Double
  public var coinsWithHoldings: Double
}

public struct MoverRow: Codable, Sendable, Hashable, Identifiable {
  public var coingeckoId: String
  public var name: String
  public var symbol: String
  public var logoUrl: String?
  public var priceUsd: Double
  public var changePct: Double
  public var impactUsd: Double?
  public var id: String { coingeckoId }
}

public struct MoversSnapshot: Codable, Sendable, Hashable {
  public var generatedAt: Double
  public var coinCount: Double
  public var missingMarketDataCount: Double
  public var gainers: [MoverRow]
  public var losers: [MoverRow]
  public var breadth: BreadthStats?
}

public enum OverviewEventKind: String, Codable, Sendable { case news, price_spike, volume_anomaly, breakout_high, breakout_low }
public enum OverviewEventTone: String, Codable, Sendable { case positive, negative, neutral }

public struct OverviewEvent: Codable, Sendable, Hashable, Identifiable {
  public var id: String
  public var articleId: String?
  public var kind: OverviewEventKind
  public var tone: OverviewEventTone
  public var sentiment: OverviewSummary.Sentiment?
  public var occurredAtMs: Double
  public var coingeckoId: String
  public var name: String
  public var symbol: String
  public var logoUrl: String?
  public var title: String
  public var summary: String?
  public var aiSummary: String?
  public var aiCategory: String?
  public var tokenHref: String
  public var externalHref: String?
  public var valueUsd: Double?
  public var percent: Double?
}

public struct EventsSnapshot: Codable, Sendable, Hashable {
  public var generatedAt: Double
  public var coinCount: Double
  public var limited: Bool
  public var events: [OverviewEvent]
  public static let empty = EventsSnapshot(generatedAt: 0, coinCount: 0, limited: false, events: [])
}

/// Dormant on web (daily brief card is unmounted); decoded loosely so the bootstrap still parses.
public struct DailyBriefCache: Codable, Sendable, Hashable {
  public var status: String
  public var stale: Bool?
  public var generatedAt: Double?
  public var expiresAt: Double?
}

public struct OverviewBootstrap: Codable, Sendable, Hashable {
  public var status: String
  public var generatedAt: Double?
  public var watchlistCoinCount: Double
  public var limited: Bool
  public var holdingsBreakdown: [OverviewHoldingsGroup]
  public var movers24h: MoversSnapshot?
  public var events: EventsSnapshot?
  public var brief24h: DailyBriefCache?

  public var isFresh: Bool { status == "fresh" }
}

public struct NewsSentimentOverlayRow: Codable, Sendable, Hashable {
  public var articleId: String
  public var sentiment: OverviewSummary.Sentiment?
  public var sentimentConfidence: Double?
  public var sentimentUpdatedAt: Double?
  public var aiSummary: String?
  public var aiCategory: String?
}

public struct RefreshSnapshotResult: Codable, Sendable {
  public var refreshed: Bool
  public var reason: String
}
