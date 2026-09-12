import Foundation

/// `apps/app/convex/lastKnownPrices.ts`
public struct LastKnownPrice: Codable, Sendable, Hashable {
  public var id: String
  public var coingeckoId: String
  public var source: String
  public var sessionId: String?
  public var priceUsd: Double
  public var publishTime: Double?
  public var confidence: Double?
  public var updatedAt: Double

  enum CodingKeys: String, CodingKey {
    case id = "_id"
    case coingeckoId, source, sessionId, priceUsd, publishTime, confidence, updatedAt
  }
}

@MainActor
public struct LastKnownPriceRepository: Sendable {
  private let convex: ConvexService
  public init(convex: ConvexService) { self.convex = convex }

  /// Unauthenticated query — safe before sign-in.
  public func latest(coingeckoId: String, source: String = "pyth") -> AsyncThrowingStream<LastKnownPrice?, Error> {
    convex.subscribe("lastKnownPrices:getLastKnownPrice", args: ["coingeckoId": coingeckoId, "source": source])
  }

  public struct UpsertResult: Codable, Sendable { public var didWrite: Bool; public var reason: String; public var updatedAt: Double }

  /// Identity-gated; best-effort persistence every 20s from the realtime coordinator.
  @discardableResult
  public func upsert(coingeckoId: String, source: String = "pyth", sessionId: String, priceUsd: Double, publishTimeMs: Double?, confidence: Double?) async throws -> UpsertResult {
    var args: ConvexArgs = ["coingeckoId": coingeckoId, "source": source, "sessionId": sessionId, "priceUsd": priceUsd]
    if let publishTimeMs { args["publishTime"] = publishTimeMs }
    if let confidence { args["confidence"] = confidence }
    return try await convex.mutation("lastKnownPrices:upsertLastKnownPrice", args: args)
  }
}
