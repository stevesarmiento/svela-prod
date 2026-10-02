import Foundation

/// Bounded cache with expiring entries and shared, cancellation-aware requests.
///
/// Reads only check the requested key's expiry; eviction (expired first, then least recently
/// used) runs on insert and only once the entry count exceeds `maxEntries`.
public actor QueryCache {
  public struct Key: Hashable, Sendable {
    public let parts: [String]
    public init(_ parts: String...) { self.parts = parts }
    public init(parts: [String]) { self.parts = parts }
  }
  private struct Entry {
    var value: any Sendable
    var fetchedAt: ContinuousClock.Instant
    var expiresAt: ContinuousClock.Instant
    var lastAccess: ContinuousClock.Instant
  }
  private struct Flight {
    let id: UUID
    let task: Task<Void, Never>
    var waiters: [UUID: CheckedContinuation<any Sendable, Error>]
  }
  private var entries: [Key: Entry] = [:]
  private var inflight: [Key: Flight] = [:]
  private let clock = ContinuousClock()
  private let maxEntries: Int

  public init(maxEntries: Int = 256) { self.maxEntries = max(1, maxEntries) }

  /// Returns the cached value while it is fresh, otherwise runs (or joins) one fetch for the key.
  /// With `staleWhileRevalidate`, a stale-but-not-expired value is returned immediately and the
  /// refetch runs in the background; a later `fetch` for the same key joins that flight.
  public func fetch<T: Sendable>(_ key: Key, policy: QueryPolicy, force: Bool = false, staleWhileRevalidate: Bool = false,
                                 fetcher: @escaping @Sendable () async throws -> T) async throws -> T {
    try Task.checkCancellation()
    if !force, let value: T = live(key) {
      if clock.now - entries[key]!.fetchedAt < policy.staleTime { return value }
      if staleWhileRevalidate {
        if inflight[key] == nil { startFlight(key, policy: policy, waiter: nil, fetcher: fetcher) }
        return value
      }
    }
    let waiterID = UUID()
    let any = try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<any Sendable, Error>) in
        if Task.isCancelled { continuation.resume(throwing: CancellationError()); return }
        if inflight[key] != nil {
          inflight[key]?.waiters[waiterID] = continuation
          return
        }
        startFlight(key, policy: policy, waiter: (waiterID, continuation), fetcher: fetcher)
      }
    } onCancel: {
      Task { await self.cancelWaiter(key, id: waiterID) }
    }
    try Task.checkCancellation()
    guard let value = any as? T else { throw APIError.decode(endpoint: key.parts.joined(separator: "/"), message: "cache type mismatch") }
    return value
  }

  private func startFlight<T: Sendable>(_ key: Key, policy: QueryPolicy, waiter: (UUID, CheckedContinuation<any Sendable, Error>)?,
                                        fetcher: @escaping @Sendable () async throws -> T) {
    let flightID = UUID()
    let task = Task {
      let result: Result<any Sendable, Error>
      do { result = .success(try await fetcher()) } catch { result = .failure(error) }
      complete(key, id: flightID, policy: policy, result: result)
    }
    var waiters: [UUID: CheckedContinuation<any Sendable, Error>] = [:]
    if let waiter { waiters[waiter.0] = waiter.1 }
    inflight[key] = Flight(id: flightID, task: task, waiters: waiters)
  }

  private func complete(_ key: Key, id: UUID, policy: QueryPolicy, result: Result<any Sendable, Error>) {
    // Invalidated/replaced requests must never repopulate the cache or finish a newer flight.
    guard let flight = inflight[key], flight.id == id else { return }
    inflight[key] = nil
    if case .success(let value) = result { insert(key, value: value, policy: policy) }
    for waiter in flight.waiters.values { waiter.resume(with: result) }
  }

  private func cancelWaiter(_ key: Key, id: UUID) {
    guard let waiter = inflight[key]?.waiters.removeValue(forKey: id) else { return }
    waiter.resume(throwing: CancellationError())
    if inflight[key]?.waiters.isEmpty == true {
      inflight.removeValue(forKey: key)?.task.cancel()
    }
  }

  /// Cached value of any age (within gc), touching its access time.
  public func peek<T: Sendable>(_ key: Key, as: T.Type = T.self) -> T? { live(key) }

  /// Cached value only while fresh under `policy`.
  public func peek<T: Sendable>(_ key: Key, policy: QueryPolicy, as: T.Type = T.self) -> T? {
    guard let value: T = live(key), clock.now - entries[key]!.fetchedAt < policy.staleTime else { return nil }
    return value
  }

  /// Fresh values for several keys in one hop (missing / stale / mismatched keys are omitted).
  public func peekFresh<T: Sendable>(_ keys: [Key], policy: QueryPolicy, as: T.Type = T.self) -> [Key: T] {
    var out: [Key: T] = [:]
    out.reserveCapacity(keys.count)
    for key in keys { if let value: T = peek(key, policy: policy) { out[key] = value } }
    return out
  }

  /// True while a fetch for `key` is running; callers batching several keys skip these and join
  /// the existing flight instead of requesting the same data twice.
  public func isInFlight(_ key: Key) -> Bool { inflight[key] != nil }

  public func isStale(_ key: Key, policy: QueryPolicy) -> Bool {
    guard let entry = entries[key], entry.expiresAt > clock.now else { return true }
    return clock.now - entry.fetchedAt >= policy.staleTime
  }

  public func set<T: Sendable>(_ key: Key, value: T, policy: QueryPolicy = .defaults) {
    cancelFlight(key)
    insert(key, value: value, policy: policy)
  }

  /// Several entries under one policy in a single hop (per-id seeding after a bulk fetch).
  /// Seeding never cancels an in-flight fetch for the same key: that flight will land equally
  /// fresh data, whereas cancelling it would silently drop its waiters' results.
  public func set<T: Sendable>(_ values: [Key: T], policy: QueryPolicy = .defaults) {
    for (key, value) in values { insert(key, value: value, policy: policy) }
  }

  public func invalidate(prefix: [String]) {
    for key in Set(entries.keys).union(inflight.keys) where Array(key.parts.prefix(prefix.count)) == prefix {
      entries[key] = nil; cancelFlight(key)
    }
  }

  public func removeAll() {
    entries.removeAll()
    for key in Array(inflight.keys) { cancelFlight(key) }
  }

  private func cancelFlight(_ key: Key) {
    guard let flight = inflight.removeValue(forKey: key) else { return }
    flight.task.cancel()
    for waiter in flight.waiters.values { waiter.resume(throwing: CancellationError()) }
  }

  // MARK: Storage

  /// The entry's value when it exists, matches `T`, and has not expired; drops it when expired.
  private func live<T: Sendable>(_ key: Key) -> T? {
    guard var entry = entries[key] else { return nil }
    let now = clock.now
    guard entry.expiresAt > now else { entries[key] = nil; return nil }
    guard let value = entry.value as? T else { return nil }
    entry.lastAccess = now; entries[key] = entry
    return value
  }

  private func insert(_ key: Key, value: any Sendable, policy: QueryPolicy) {
    let now = clock.now
    entries[key] = Entry(value: value, fetchedAt: now, expiresAt: now + policy.gcTime, lastAccess: now)
    if entries.count > maxEntries { evict() }
  }

  /// Over capacity: drop expired entries first, then the least recently used until within cap.
  private func evict() {
    let now = clock.now
    for (key, entry) in entries where entry.expiresAt <= now { entries[key] = nil }
    let overflow = entries.count - maxEntries
    guard overflow > 0 else { return }
    var ranked = entries.map { ($0.key, $0.value.lastAccess) }
    ranked.sort { $0.1 < $1.1 }
    for (key, _) in ranked.prefix(overflow) { entries[key] = nil }
  }
}
