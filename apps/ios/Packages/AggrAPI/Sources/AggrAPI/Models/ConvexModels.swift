import Foundation

/// Convex `watchlistGroups` document (see `apps/app/convex/schema.ts`).
public struct WatchlistGroup: Codable, Sendable, Hashable, Identifiable {
  public var id: String
  public var creationTime: Double
  public var userId: String
  public var name: String
  public var slug: String
  public var description: String?
  public var icon: String?
  public var color: String?
  public var isDefault: Bool
  public var createdAt: Double
  public var updatedAt: Double

  enum CodingKeys: String, CodingKey {
    case id = "_id"
    case creationTime = "_creationTime"
    case userId, name, slug, description, icon, color, isDefault, createdAt, updatedAt
  }

  public init(
    id: String, creationTime: Double = 0, userId: String = "", name: String, slug: String,
    description: String? = nil, icon: String? = nil, color: String? = nil, isDefault: Bool = false,
    createdAt: Double = 0, updatedAt: Double = 0
  ) {
    self.id = id; self.creationTime = creationTime; self.userId = userId; self.name = name; self.slug = slug
    self.description = description; self.icon = icon; self.color = color; self.isDefault = isDefault
    self.createdAt = createdAt; self.updatedAt = updatedAt
  }

  public var createdDate: Date { Date(timeIntervalSince1970: createdAt / 1000) }
}

/// Convex `watchlists` membership row, with canonical holdings merged in by the server.
public struct WatchlistItem: Codable, Sendable, Hashable, Identifiable {
  public var id: String
  public var creationTime: Double
  public var userId: String
  public var watchlistGroupId: String
  public var coinId: String
  /// Canonical quantity for (user, coin); `nil` when the user never entered one.
  public var holdings: Double?

  enum CodingKeys: String, CodingKey {
    case id = "_id"
    case creationTime = "_creationTime"
    case userId, watchlistGroupId, coinId, holdings
  }

  public init(id: String, creationTime: Double = 0, userId: String = "", watchlistGroupId: String, coinId: String, holdings: Double? = nil) {
    self.id = id; self.creationTime = creationTime; self.userId = userId
    self.watchlistGroupId = watchlistGroupId; self.coinId = coinId; self.holdings = holdings
  }
}

/// `watchlists:getMyWatchlistsPageBootstrap`
public struct WatchlistsPageBootstrap: Codable, Sendable, Hashable {
  public var groups: [WatchlistGroup]
  public var defaultGroup: WatchlistGroup?
  public var itemsByGroupId: [String: [WatchlistItem]]

  public init(groups: [WatchlistGroup] = [], defaultGroup: WatchlistGroup? = nil, itemsByGroupId: [String: [WatchlistItem]] = [:]) {
    self.groups = groups; self.defaultGroup = defaultGroup; self.itemsByGroupId = itemsByGroupId
  }

  public static let empty = WatchlistsPageBootstrap()

  public var allCoinIds: [String] {
    var seen = Set<String>()
    var out: [String] = []
    for group in groups {
      for item in itemsByGroupId[group.id] ?? [] where !seen.contains(item.coinId) {
        seen.insert(item.coinId); out.append(item.coinId)
      }
    }
    return out
  }
}

/// `watchlists:getMyWatchlistBySlug`
public struct WatchlistBySlug: Codable, Sendable, Hashable {
  public var group: WatchlistGroup
  public var items: [WatchlistItem]
}
