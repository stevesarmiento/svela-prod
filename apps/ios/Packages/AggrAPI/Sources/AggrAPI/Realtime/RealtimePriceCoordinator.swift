import AggrCore
import Foundation
import Observation

/// Port of `hooks/use-realtime-quote.ts` + `live-spot-store.ts`.
/// One coordinator per app; call `subscribe(coingeckoId:symbol:)` from the token screen and `unsubscribe`.
/// - UI throttle 1s, stale → fallback after 7.5s without ticks, persist to Convex every 20s (session id in UserDefaults).
@MainActor
@Observable
public final class RealtimePriceCoordinator {
  public struct LiveSpot: Sendable, Hashable {
    public enum Source: String, Sendable { case pyth, lastKnown }
    public var priceUsd: Double
    public var updatedAtMs: Double
    public var source: Source
  }

  public private(set) var spotByCoin: [String: LiveSpot] = [:]
  public private(set) var statusByCoin: [String: RealtimeQuoteStatus] = [:]

  static let uiThrottleMs: Double = 1_000
  static let persistIntervalMs: Double = 20_000
  static let realtimeStaleMs: Double = 7_500

  private let stream: PythHermesStream
  private let resolver: PythFeedResolver
  private let lastKnown: LastKnownPriceRepository
  private let convex: ConvexService
  private var tasks: [String: Task<Void, Never>] = [:]
  private var sessionId: String

  public init(stream: PythHermesStream = PythHermesStream(), resolver: PythFeedResolver = PythFeedResolver(), convex: ConvexService) {
    self.stream = stream
    self.resolver = resolver
    self.convex = convex
    self.lastKnown = LastKnownPriceRepository(convex: convex)
    let key = "SVELA_REALTIME_PRICE_SESSION_ID"
    if let existing = UserDefaults.standard.string(forKey: key), existing.count > 8 {
      sessionId = existing
    } else {
      let next = UUID().uuidString
      UserDefaults.standard.set(next, forKey: key)
      sessionId = next
    }
  }

  public func spot(_ coinId: String) -> LiveSpot? { spotByCoin[coinId] }
  public func status(_ coinId: String) -> RealtimeQuoteStatus { statusByCoin[coinId] ?? .disabled }

  /// Starts warm-start + stream + persistence for a coin. Idempotent.
  public func subscribe(coingeckoId: String, symbol: String?) {
    let id = coingeckoId.trimmingCharacters(in: .whitespaces)
    guard !id.isEmpty, tasks[id] == nil else { return }
    statusByCoin[id] = .fallback
    tasks[id] = Task { [weak self] in
      guard let self else { return }
      await self.run(coinId: id, symbol: symbol)
    }
  }

  public func unsubscribe(coingeckoId: String) {
    tasks[coingeckoId]?.cancel()
    tasks[coingeckoId] = nil
  }

  private func run(coinId: String, symbol: String?) async {
    // Warm start from Convex last-known (unauthenticated query).
    let warmTask = Task { [weak self] in
      guard let self else { return }
      do {
        for try await row in lastKnown.latest(coingeckoId: coinId) {
          guard let row, row.priceUsd.isFinite, row.priceUsd > 0 else { continue }
          if statusByCoin[coinId] != .realtime {
            spotByCoin[coinId] = LiveSpot(priceUsd: row.priceUsd, updatedAtMs: row.updatedAt, source: .lastKnown)
            statusByCoin[coinId] = .lastKnown
          }
        }
      } catch {}
    }
    defer { warmTask.cancel() }

    // Feed id: curated mapping, else dynamic resolution by symbol.
    var feedId = PythHermes.feedId(forCoingeckoId: coinId)
    if feedId == nil, let symbol, !symbol.isEmpty {
      feedId = await resolver.resolveCryptoUsdFeedId(symbol: symbol)
    }
    guard let feedId, !Task.isCancelled else { return }

    var lastUiUpdate: Double = 0
    var lastPersist: Double = 0
    var lastTickAt: Double? = nil
    var latestTick: PythHermes.Tick? = nil

    // Stale watchdog (1s) — degrade to fallback when no tick for 7.5s.
    let watchdog = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        guard let self, let at = lastTickAt else { continue }
        let now = Date().timeIntervalSince1970 * 1000
        if now - at > Self.realtimeStaleMs, statusByCoin[coinId] == .realtime {
          statusByCoin[coinId] = .fallback
        }
      }
    }
    defer { watchdog.cancel() }

    for await tick in stream.ticks(feedIds: [feedId]) {
      if Task.isCancelled { break }
      guard tick.feedId == feedId else { continue }
      let now = Date().timeIntervalSince1970 * 1000
      latestTick = tick
      lastTickAt = now
      if now - lastUiUpdate >= Self.uiThrottleMs {
        lastUiUpdate = now
        let updatedAt = tick.publishTimeMs ?? now
        spotByCoin[coinId] = LiveSpot(priceUsd: tick.priceUsd, updatedAtMs: updatedAt, source: .pyth)
        statusByCoin[coinId] = .realtime
      }
      if now - lastPersist >= Self.persistIntervalMs, convex.authStatus == .authenticated, let t = latestTick {
        lastPersist = now
        let sid = sessionId
        Task { [lastKnown] in
          _ = try? await lastKnown.upsert(coingeckoId: coinId, sessionId: sid, priceUsd: t.priceUsd, publishTimeMs: t.publishTimeMs, confidence: t.confidenceUsd)
        }
      }
    }
  }
}
