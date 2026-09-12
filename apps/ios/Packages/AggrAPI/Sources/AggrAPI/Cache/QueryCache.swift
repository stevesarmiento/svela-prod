import Foundation

/// Minimal TanStack-like cache: keyed entries with fetchedAt, in-flight de-duplication, stale checks.
public actor QueryCache {
  public struct Key: Hashable, Sendable {
    public let parts: [String]
    public init(_ parts: String...) { self.parts = parts }
    public init(parts: [String]) { self.parts = parts }
  }

  private struct Entry {
    var value: any Sendable
    var fetchedAt: ContinuousClock.Instant
  }

  private var entries: [Key: Entry] = [:]
  private var inflight: [Key: Task<any Sendable, Error>] = [:]
  private let clock = ContinuousClock()

  public init() {}

  /// Returns cached value if fresh per `policy.staleTime`, otherwise fetches (deduping concurrent callers).
  /// `force` bypasses the freshness check but still dedupes.
  public func fetch<T: Sendable>(_ key: Key, policy: QueryPolicy, force: Bool = false, fetcher: @escaping @Sendable () async throws -> T) async throws -> T {
    if !force, let entry = entries[key], let v = entry.value as? T, clock.now - entry.fetchedAt < policy.staleTime {
      return v
    }
    if let task = inflight[key] {
      let any = try await task.value
      if let v = any as? T { return v }
    }
    let task = Task<any Sendable, Error> { try await fetcher() }
    inflight[key] = task
    defer { inflight[key] = nil }
    let any = try await task.value
    guard let value = any as? T else { throw APIError.decode(endpoint: key.parts.joined(separator: "/"), message: "cache type mismatch") }
    entries[key] = Entry(value: value, fetchedAt: clock.now)
    return value
  }

  /// Last known value regardless of freshness (for stale-while-revalidate UI).
  public func peek<T: Sendable>(_ key: Key, as: T.Type = T.self) -> T? {
    entries[key]?.value as? T
  }

  public func isStale(_ key: Key, policy: QueryPolicy) -> Bool {
    guard let entry = entries[key] else { return true }
    return clock.now - entry.fetchedAt >= policy.staleTime
  }

  public func set<T: Sendable>(_ key: Key, value: T) {
    entries[key] = Entry(value: value, fetchedAt: clock.now)
  }

  public func invalidate(prefix: [String]) {
    for key in entries.keys where Array(key.parts.prefix(prefix.count)) == prefix {
      entries[key] = nil
    }
  }

  public func removeAll() {
    entries.removeAll()
  }
}
