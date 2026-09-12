import AggrCore
import Foundation

/// `apps/app/convex/coingeckoNews.ts`
public struct NewsArticle: Codable, Sendable, Hashable, Identifiable {
  public var articleId: String
  public var title: String
  public var url: String
  public var sourceName: String?
  public var postedAtIso: String?
  public var postedAtMs: Double
  public var sentiment: OverviewSummary.Sentiment?
  public var sentimentConfidence: Double?
  public var sentimentUpdatedAt: Double?
  public var aiSummary: String?
  public var aiCategory: String?
  public var id: String { articleId }
}

@MainActor
public struct NewsRepository: Sendable {
  private let convex: ConvexService
  public init(convex: ConvexService) { self.convex = convex }

  /// Unauthenticated; `limit` capped at 50 server-side.
  public func articles(coinId: String, limit: Int) -> AsyncThrowingStream<[NewsArticle], Error> {
    convex.subscribe("coingeckoNews:listNewsByCoinId", args: ["coingeckoId": coinId, "limit": Double(limit)])
  }

  /// Identity-gated: live CoinGecko fetch + ingest for this coin.
  public func refreshNow(coinId: String) async throws {
    try await convex.action("coingeckoNews:refreshNewsForCoinNow", args: ["coingeckoId": coinId])
  }

  /// Identity-gated: schedule sentiment for articles missing it.
  public func requestSentiment(articleIds: [String]) async throws {
    guard !articleIds.isEmpty else { return }
    try await convex.mutation("coingeckoNews:requestSentimentForArticles", args: ["articleIds": ConvexArray(strings: articleIds)])
  }
}
