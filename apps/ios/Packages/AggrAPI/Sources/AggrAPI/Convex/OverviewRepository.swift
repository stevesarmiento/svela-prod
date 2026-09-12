import Foundation

/// Identity-tier overview functions (`apps/app/convex/overview.ts`, `watchlists.ts`).
@MainActor
public struct OverviewRepository: Sendable {
  private let convex: ConvexService
  public init(convex: ConvexService) { self.convex = convex }

  public func bootstrap() -> AsyncThrowingStream<OverviewBootstrap, Error> {
    convex.subscribe("overview:getMyOverviewBootstrap")
  }

  public func holdingsBreakdown() -> AsyncThrowingStream<[OverviewHoldingsGroup], Error> {
    convex.subscribe("watchlists:getMyHoldingsBreakdownByWatchlistGroup")
  }

  /// Unauthenticated query; up to 100 ids.
  public func sentimentOverlay(articleIds: [String]) -> AsyncThrowingStream<[NewsSentimentOverlayRow], Error> {
    convex.subscribe("overview:getNewsSentimentOverlay", args: ["articleIds": ConvexArray(strings: Array(articleIds.prefix(100)))])
  }

  /// Regenerates the snapshot when stale/missing (server enforces the 1h TTL and 2-min cooldowns).
  @discardableResult
  public func refreshSnapshot(force: Bool = false) async throws -> RefreshSnapshotResult {
    try await convex.action("overview:refreshMyOverviewSnapshot", args: ["force": force])
  }
}
