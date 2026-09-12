import Foundation

/// Bounded cache with expiring entries and shared, cancellation-aware requests.
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

  public func fetch<T: Sendable>(_ key: Key, policy: QueryPolicy, force: Bool = false, fetcher: @escaping @Sendable () async throws -> T) async throws -> T {
    try Task.checkCancellation()
    prune()
    if !force, var entry = entries[key], let value = entry.value as? T, clock.now - entry.fetchedAt < policy.staleTime {
      entry.lastAccess = clock.now; entries[key] = entry
      return value
    }
    let waiterID = UUID()
    let any = try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<any Sendable, Error>) in
        if Task.isCancelled { continuation.resume(throwing: CancellationError()); return }
        if inflight[key] != nil {
          inflight[key]?.waiters[waiterID] = continuation
          return
        }
        let flightID = UUID()
        let task = Task {
          let result: Result<any Sendable, Error>
          do { result = .success(try await fetcher()) } catch { result = .failure(error) }
          complete(key, id: flightID, policy: policy, result: result)
        }
        inflight[key] = Flight(id: flightID, task: task, waiters: [waiterID: continuation])
      }
    } onCancel: {
      Task { await self.cancelWaiter(key, id: waiterID) }
    }
    try Task.checkCancellation()
    guard let value = any as? T else { throw APIError.decode(endpoint: key.parts.joined(separator: "/"), message: "cache type mismatch") }
    return value
  }

  private func complete(_ key: Key, id: UUID, policy: QueryPolicy, result: Result<any Sendable, Error>) {
    // Invalidated/replaced requests must never repopulate the cache or finish a newer flight.
    guard let flight = inflight[key], flight.id == id else { return }
    inflight[key] = nil
    if case .success(let value) = result {
      entries[key] = Entry(value: value, fetchedAt: clock.now, expiresAt: clock.now + policy.gcTime, lastAccess: clock.now)
      prune()
    }
    for waiter in flight.waiters.values { waiter.resume(with: result) }
  }

  private func cancelWaiter(_ key: Key, id: UUID) {
    guard let waiter = inflight[key]?.waiters.removeValue(forKey: id) else { return }
    waiter.resume(throwing: CancellationError())
    if inflight[key]?.waiters.isEmpty == true {
      inflight.removeValue(forKey: key)?.task.cancel()
    }
  }

  public func peek<T: Sendable>(_ key: Key, as: T.Type = T.self) -> T? {
    prune()
    guard var entry = entries[key] else { return nil }
    entry.lastAccess = clock.now; entries[key] = entry
    return entry.value as? T
  }
  public func isStale(_ key: Key, policy: QueryPolicy) -> Bool {
    prune()
    guard let entry = entries[key] else { return true }
    return clock.now - entry.fetchedAt >= policy.staleTime
  }
  public func set<T: Sendable>(_ key: Key, value: T, policy: QueryPolicy = .defaults) {
    cancelFlight(key)
    entries[key] = Entry(value: value, fetchedAt: clock.now, expiresAt: clock.now + policy.gcTime, lastAccess: clock.now)
    prune()
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
  private func prune() {
    let now = clock.now
    entries = entries.filter { $0.value.expiresAt > now }
    if entries.count > maxEntries {
      for key in entries.sorted(by: { $0.value.lastAccess < $1.value.lastAccess }).prefix(entries.count - maxEntries).map(\.key) {
        entries[key] = nil
      }
    }
  }
}
