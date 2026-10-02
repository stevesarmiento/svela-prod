import AggrCore
import Foundation
import Observation

/// Port of `hooks/use-realtime-quote.ts` + `live-spot-store.ts`.
/// One coordinator per app; call `subscribe(coingeckoId:symbol:)` from the token screen and `unsubscribe`.
/// - UI throttle 1s, stale → fallback after 7.5s without ticks, persist to Convex every 20s (session id in UserDefaults).
///
/// Each coin's spot/status lives in its own observable box, so a view reading `spot(_:)` for one
/// coin re-renders only when that coin changes, never when another subscription ticks.
@MainActor
@Observable
public final class RealtimePriceCoordinator {
  public struct LiveSpot: Sendable, Hashable {
    public enum Source: String, Sendable { case pyth, lastKnown }
    public var priceUsd: Double
    public var updatedAtMs: Double
    public var source: Source
    public init(priceUsd: Double, updatedAtMs: Double, source: Source) {
      self.priceUsd = priceUsd; self.updatedAtMs = updatedAtMs; self.source = source
    }
  }

  @Observable
  final class CoinState {
    var spot: LiveSpot?
    var status: RealtimeQuoteStatus = .disabled
  }

  /// Bulk snapshots (not observable; per-coin reads go through `spot(_:)` / `status(_:)`).
  public var spotByCoin: [String: LiveSpot] { states.compactMapValues(\.spot) }
  public var statusByCoin: [String: RealtimeQuoteStatus] { states.compactMapValues { $0.status == .disabled ? nil : $0.status } }

  static let uiThrottleMs: Double = 1_000
  static let persistIntervalMs: Double = 20_000
  static let realtimeStaleMs: Double = 7_500

  private let stream: PythHermesStream
  private let resolver: PythFeedResolver
  private let lastKnown: LastKnownPriceRepository
  private let convex: ConvexService
  @ObservationIgnored private var states: [String: CoinState] = [:]
  @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var watchdogs: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var generations: [String: UUID] = [:]
  @ObservationIgnored private var lastTickAtMs: [String: Double] = [:]
  @ObservationIgnored private var sessionId: String

  public init(stream: PythHermesStream = PythHermesStream(), resolver: PythFeedResolver = PythFeedResolver(), convex: ConvexService) {
    self.stream = stream
    self.resolver = resolver
    self.convex = convex
    self.lastKnown = LastKnownPriceRepository(convex: convex)
    #if DEBUG
    if convex.isPreview { sessionId = "preview"; return }
    #endif
    let key = "SVELA_REALTIME_PRICE_SESSION_ID"
    if let existing = UserDefaults.standard.string(forKey: key), existing.count > 8 {
      sessionId = existing
    } else {
      let next = UUID().uuidString
      UserDefaults.standard.set(next, forKey: key)
      sessionId = next
    }
  }

  public func spot(_ coinId: String) -> LiveSpot? { state(coinId).spot }
  public func status(_ coinId: String) -> RealtimeQuoteStatus { state(coinId).status }

  private func state(_ coinId: String) -> CoinState {
    if let existing = states[coinId] { return existing }
    let created = CoinState()
    states[coinId] = created
    return created
  }

  private func setSpot(_ coinId: String, _ next: LiveSpot?) {
    let box = state(coinId)
    if box.spot != next { box.spot = next }
  }

  private func setStatus(_ coinId: String, _ next: RealtimeQuoteStatus) {
    let box = state(coinId)
    if box.status != next { box.status = next }
  }

  /// Starts warm-start + stream + persistence for a coin. Idempotent.
  public func subscribe(coingeckoId: String, symbol: String?) {
    #if DEBUG
    if convex.isPreview { return }
    #endif
    let id = coingeckoId.trimmingCharacters(in: .whitespaces)
    guard !id.isEmpty, tasks[id] == nil else { return }
    let generation = UUID()
    generations[id] = generation
    setStatus(id, .fallback)
    tasks[id] = Task { [weak self] in
      guard let self else { return }
      await self.run(coinId: id, symbol: symbol, generation: generation)
    }
  }

  public func unsubscribe(coingeckoId: String) {
    generations[coingeckoId] = nil
    lastTickAtMs[coingeckoId] = nil
    setStatus(coingeckoId, .fallback)
    watchdogs[coingeckoId]?.cancel()
    watchdogs[coingeckoId] = nil
    tasks[coingeckoId]?.cancel()
    tasks[coingeckoId] = nil
  }

  public func stopAll() {
    for id in Array(tasks.keys) { unsubscribe(coingeckoId: id) }
    for (id, box) in states {
      if box.spot != nil { box.spot = nil }
      if box.status != .disabled { box.status = .disabled }
      _ = id
    }
  }

  private func run(coinId: String, symbol: String?, generation: UUID) async {
    // Warm start from Convex last-known (unauthenticated query). The subscription would otherwise
    // stay open for the page lifetime and echo our own 20s upserts back, so it ends on the first
    // realtime tick.
    let warmTask = Task { [weak self] in
      guard let self else { return }
      do {
        for try await row in lastKnown.latest(coingeckoId: coinId) {
          guard !Task.isCancelled, generations[coinId] == generation else { return }
          guard let row, row.priceUsd.isFinite, row.priceUsd > 0 else { continue }
          if status(coinId) != .realtime {
            setSpot(coinId, LiveSpot(priceUsd: row.priceUsd, updatedAtMs: min(row.publishTime ?? row.updatedAt, row.updatedAt), source: .lastKnown))
            setStatus(coinId, .lastKnown)
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
    guard !Task.isCancelled, generations[coinId] == generation else { return }
    guard let feedId else {
      await withTaskCancellationHandler { await warmTask.value } onCancel: { warmTask.cancel() }
      return
    }

    var lastUiUpdate: Double = 0
    var lastPersist: Double = 0
    var latestTick: PythHermes.Tick? = nil
    var warmCancelled = false

    for await tick in stream.ticks(feedIds: [feedId]) {
      if Task.isCancelled || generations[coinId] != generation { break }
      guard tick.feedId == feedId else { continue }
      let now = Date().timeIntervalSince1970 * 1000
      latestTick = tick
      lastTickAtMs[coinId] = now
      if now - lastUiUpdate >= Self.uiThrottleMs {
        lastUiUpdate = now
        let updatedAt = tick.publishTimeMs ?? now
        setSpot(coinId, LiveSpot(priceUsd: tick.priceUsd, updatedAtMs: updatedAt, source: .pyth))
        setStatus(coinId, .realtime)
        if !warmCancelled { warmCancelled = true; warmTask.cancel() }
        // Stale watchdog: one deadline re-armed per published tick instead of a 1s polling loop.
        armWatchdog(coinId: coinId, generation: generation, after: .milliseconds(Int(Self.realtimeStaleMs)))
      }
      if now - lastPersist >= Self.persistIntervalMs, convex.authStatus == .authenticated, let t = latestTick {
        lastPersist = now
        let sid = sessionId
        Task { [lastKnown] in
          _ = try? await lastKnown.upsert(coingeckoId: coinId, sessionId: sid, priceUsd: t.priceUsd, publishTimeMs: t.publishTimeMs, confidence: t.confidenceUsd)
        }
      }
    }
    // A resubscribe may already have armed the next generation's watchdog; leave it alone.
    if generations[coinId] == generation {
      watchdogs[coinId]?.cancel()
      watchdogs[coinId] = nil
    }
  }

  /// Degrades to `.fallback` once no tick has arrived for `realtimeStaleMs`. Ticks inside the UI
  /// throttle window do not re-arm, so on firing it checks the real last-tick time and re-arms
  /// for the remainder when a tick did arrive.
  private func armWatchdog(coinId: String, generation: UUID, after delay: Duration) {
    watchdogs[coinId]?.cancel()
    watchdogs[coinId] = Task { [weak self] in
      try? await Task.sleep(for: delay)
      guard !Task.isCancelled, let self, self.generations[coinId] == generation else { return }
      let now = Date().timeIntervalSince1970 * 1000
      let elapsed = now - (self.lastTickAtMs[coinId] ?? now)
      if elapsed >= Self.realtimeStaleMs {
        if self.status(coinId) == .realtime { self.setStatus(coinId, .fallback) }
      } else {
        self.armWatchdog(coinId: coinId, generation: generation, after: .milliseconds(Int(Self.realtimeStaleMs - elapsed) + 1))
      }
    }
  }
}
