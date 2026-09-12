import AggrAPI
import AggrCore
import Foundation
import Observation

/// Port of `floating-market-feed.tsx` data flow: Convex `listNewsByCoinId` subscription sized by the user's
/// feed setting, one auto-refresh for coins with no cached news, sentiment requests for new articles,
/// and per-coin "last seen" tracking (UserDefaults) that powers the unseen badge.
@Observable
final class MarketFeedStore {
  let coinId: String
  private(set) var articles: [NewsArticle]?
  private(set) var isRefreshing = false
  private(set) var refreshError: String?
  var feedSize: Int { didSet { UserDefaults.standard.set(feedSize, forKey: Self.sizeKey); restart() } }
  private(set) var lastSeenMs: Double

  private let news: NewsRepository
  private let canMutate: () -> Bool
  private var task: Task<Void, Never>?
  private var autoRefreshed = false
  private var requestedSentimentKey = ""

  static let sizeKey = "marketFeed.size"
  static let lastSeenKey = "marketFeed.lastSeen"

  init(coinId: String, news: NewsRepository, canMutate: @escaping () -> Bool) {
    self.coinId = coinId
    self.news = news
    self.canMutate = canMutate
    self.feedSize = MarketFeed.sanitizeSize(UserDefaults.standard.object(forKey: Self.sizeKey) as? Int)
    self.lastSeenMs = Self.readLastSeen()[coinId] ?? 0
  }

  var isLoading: Bool { articles == nil }
  var latestPostedMs: Double { (articles ?? []).map(\.postedAtMs).max() ?? 0 }
  var unseenCount: Int {
    guard let articles else { return 0 }
    return MarketFeed.countUnseen(postedAtMs: articles.map { Optional($0.postedAtMs) }, lastSeenMs: lastSeenMs)
  }

  func start() { restart() }
  func stop() { task?.cancel(); task = nil }

  private func restart() {
    task?.cancel()
    task = Task { [weak self] in
      guard let self else { return }
      do {
        for try await list in news.articles(coinId: coinId, limit: feedSize) {
          articles = list
          await onArticles(list)
        }
      } catch {
        if !Task.isCancelled { refreshError = error.localizedDescription }
      }
    }
  }

  private func onArticles(_ list: [NewsArticle]) async {
    guard canMutate() else { return }
    if list.isEmpty, !autoRefreshed, !isRefreshing {
      autoRefreshed = true
      await refresh()
    }
    let missing = list.filter { $0.sentiment == nil }.map(\.articleId)
    let key = missing.joined(separator: ",")
    if !missing.isEmpty, key != requestedSentimentKey {
      requestedSentimentKey = key
      try? await news.requestSentiment(articleIds: missing)
    }
  }

  func refresh() async {
    guard !isRefreshing else { return }
    isRefreshing = true; refreshError = nil
    defer { isRefreshing = false }
    do { try await news.refreshNow(coinId: coinId) } catch { refreshError = error.localizedDescription }
  }

  func cycleSize() { feedSize = MarketFeed.nextSize(feedSize) }

  /// Everything loaded counts as seen while the sheet is open.
  func markSeen() {
    let latest = latestPostedMs
    guard latest > lastSeenMs else { return }
    lastSeenMs = latest
    let map = MarketFeed.recordLastSeen(Self.readLastSeen(), coinId: coinId, seenAtMs: latest)
    UserDefaults.standard.set(map, forKey: Self.lastSeenKey)
  }

  private static func readLastSeen() -> [String: Double] {
    MarketFeed.sanitizeLastSeen((UserDefaults.standard.dictionary(forKey: lastSeenKey) as? [String: Double]) ?? [:])
  }
}
