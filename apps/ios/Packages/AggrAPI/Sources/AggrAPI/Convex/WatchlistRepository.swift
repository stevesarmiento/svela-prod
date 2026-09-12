import Foundation
@preconcurrency import ConvexMobile

/// Typed wrappers over the identity-tier functions in `apps/app/convex/watchlists.ts`.
/// All numeric args are sent as `Double` (Convex `v.number()` is Float64).
@MainActor
public struct WatchlistRepository: Sendable {
  private let convex: ConvexService

  public init(convex: ConvexService) { self.convex = convex }

  // Subscriptions
  public func groups() -> AsyncThrowingStream<[WatchlistGroup], Error> {
    convex.subscribe("watchlists:listMyWatchlistGroups")
  }

  public func pageBootstrap() -> AsyncThrowingStream<WatchlistsPageBootstrap, Error> {
    convex.subscribe("watchlists:getMyWatchlistsPageBootstrap")
  }

  public func items(groupId: String) -> AsyncThrowingStream<[WatchlistItem], Error> {
    convex.subscribe("watchlists:getMyWatchlistByGroup", args: ["groupId": groupId])
  }

  public func allCoinIds() -> AsyncThrowingStream<[String], Error> {
    convex.subscribe("watchlists:getMyAllWatchlistCoinIds")
  }

  // Mutations
  public func createGroup(name: String, description: String? = nil, icon: String? = nil, color: String? = nil) async throws -> String {
    var args: ConvexArgs = ["name": name]
    if let description { args["description"] = description }
    if let icon { args["icon"] = icon }
    if let color { args["color"] = color }
    return try await convex.mutation("watchlists:createMyWatchlistGroup", args: args)
  }

  public func updateGroup(id: String, name: String? = nil, description: String? = nil, icon: String? = nil, color: String? = nil) async throws {
    var args: ConvexArgs = ["groupId": id]
    if let name { args["name"] = name }
    if let description { args["description"] = description }
    if let icon { args["icon"] = icon }
    if let color { args["color"] = color }
    try await convex.mutation("watchlists:updateMyWatchlistGroup", args: args)
  }

  public func deleteGroup(id: String) async throws {
    try await convex.mutation("watchlists:deleteMyWatchlistGroup", args: ["groupId": id])
  }

  public func add(coinId: String, groupId: String?) async throws -> String {
    var args: ConvexArgs = ["coinId": coinId]
    if let groupId { args["groupId"] = groupId }
    return try await convex.mutation("watchlists:addToMyWatchlist", args: args)
  }

  public func remove(coinId: String, groupId: String?) async throws {
    var args: ConvexArgs = ["coinId": coinId]
    if let groupId { args["groupId"] = groupId }
    try await convex.mutation("watchlists:removeFromMyWatchlist", args: args)
  }

  public struct BulkRemoveResult: Codable, Sendable { public var removedCount: Double }

  public func removeBulk(coinIds: [String], groupId: String?) async throws -> Int {
    var args: ConvexArgs = ["coinIds": ConvexArray(strings: coinIds)]
    if let groupId { args["groupId"] = groupId }
    let result: BulkRemoveResult = try await convex.mutation("watchlists:removeBulkFromMyWatchlist", args: args)
    return Int(result.removedCount)
  }

  public func removeFromAll(coinId: String) async throws {
    try await convex.mutation("watchlists:removeFromAllMyWatchlists", args: ["coinId": coinId])
  }

  public func setHoldings(groupId: String, coinId: String, holdings: Double?) async throws {
    let args: ConvexArgs = ["groupId": groupId, "coinId": coinId, "holdings": holdings]
    try await convex.mutation("watchlists:setMyWatchlistItemHoldings", args: args)
  }
}
