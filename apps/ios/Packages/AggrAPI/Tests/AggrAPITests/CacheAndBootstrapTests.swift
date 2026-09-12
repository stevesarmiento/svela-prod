import Foundation
import Testing
@testable import AggrAPI

private actor Gate {
  private var opened = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  func wait() async { if !opened { await withCheckedContinuation { waiting.append($0) } } }
  func open() { opened = true; waiting.forEach { $0.resume() }; waiting = [] }
}
private actor Counter {
  var count = 0
  func increment() { count += 1 }
}

@Suite struct QueryCacheTests {
  @Test func concurrentRequestsShareFetch() async throws {
    let cache = QueryCache(), gate = Gate(), started = Gate(), count = Counter()
    let key = QueryCache.Key("shared")
    let fetch: @Sendable () async throws -> Int = { await count.increment(); await started.open(); await gate.wait(); return 42 }
    let first = Task { try await cache.fetch(key, policy: .defaults, fetcher: fetch) }
    await started.wait()
    let second = Task { try await cache.fetch(key, policy: .defaults, fetcher: fetch) }
    await gate.open()
    #expect(try await first.value == 42)
    #expect(try await second.value == 42)
    #expect(await count.count == 1)
  }

  @Test func cancelledWaiterReturnsWithoutWaitingForTransport() async throws {
    let cache = QueryCache(), started = Gate(), gate = Gate()
    let pending = Task { try await cache.fetch(.init("cancelled"), policy: .defaults) { await started.open(); await gate.wait(); return 1 } }
    await started.wait()
    pending.cancel()
    do { _ = try await pending.value; Issue.record("Expected cancellation") } catch { #expect(error is CancellationError) }
    await gate.open()
    let value: Int? = await cache.peek(.init("cancelled"))
    #expect(value == nil)
  }

  @Test func signOutDiscardsLateResponse() async throws {
    let cache = QueryCache(), started = Gate(), gate = Gate()
    let key = QueryCache.Key("account")
    let old = Task { try await cache.fetch(key, policy: .defaults) { await started.open(); await gate.wait(); return "old" } }
    await started.wait()
    await cache.removeAll()
    let new = try await cache.fetch(key, policy: .defaults) { "new" }
    #expect(new == "new")
    await gate.open()
    do { _ = try await old.value; Issue.record("Expected cancellation") } catch { #expect(error is CancellationError) }
    let cached: String? = await cache.peek(key)
    #expect(cached == "new")
  }

  @Test func expiredAndLeastRecentlyUsedEntriesAreRemoved() async throws {
    let cache = QueryCache(maxEntries: 2)
    await cache.set(.init("a"), value: 1)
    await cache.set(.init("b"), value: 2)
    let a: Int? = await cache.peek(.init("a")); #expect(a == 1)
    await cache.set(.init("c"), value: 3)
    let b: Int? = await cache.peek(.init("b")); #expect(b == nil)
    await cache.set(.init("expired"), value: 4, policy: .init(staleTime: .zero, gcTime: .zero))
    let expired: Int? = await cache.peek(.init("expired")); #expect(expired == nil)
  }
}

@Suite @MainActor struct BootstrapRecoveryTests {
  enum Failure: Error { case unavailable }
  @Test func transientFailureRetriesBeforeBecomingReady() async {
    var attempts = 0
    let bootstrap = UserBootstrap(currentUserId: { "user" }, isAuthenticated: { true }, retryDelay: .zero) {
      attempts += 1
      if attempts < 3 { throw Failure.unavailable }
    }
    await bootstrap.bootstrapIfNeeded()
    #expect(attempts == 3)
    #expect(bootstrap.bootstrappedUserId == "user")
    #expect(bootstrap.lastError == nil)
    await bootstrap.bootstrapIfNeeded()
    #expect(attempts == 3)
  }
  @Test func exhaustedFailureRemainsRetryable() async {
    var failing = true
    let bootstrap = UserBootstrap(currentUserId: { "user" }, isAuthenticated: { true }, retryDelay: .zero) {
      if failing { throw Failure.unavailable }
    }
    await bootstrap.bootstrapIfNeeded()
    #expect(bootstrap.bootstrappedUserId == nil)
    #expect(bootstrap.lastError != nil)
    #expect(!bootstrap.isLoading)
    failing = false
    await bootstrap.bootstrapIfNeeded()
    #expect(bootstrap.bootstrappedUserId == "user")
    #expect(bootstrap.lastError == nil)
  }
  @Test func oldAccountCannotCompleteNewAccountBootstrap() async {
    let started = Gate(), gate = Gate()
    var user = "old"
    let bootstrap = UserBootstrap(currentUserId: { user }, isAuthenticated: { true }) {
      await started.open(); await gate.wait()
    }
    let task = Task { await bootstrap.bootstrapIfNeeded() }
    await started.wait()
    user = "new"; bootstrap.reset()
    await gate.open(); await task.value
    #expect(bootstrap.bootstrappedUserId == nil)
    await bootstrap.bootstrapIfNeeded()
    #expect(bootstrap.bootstrappedUserId == "new")
  }
}

@Suite struct MembershipTests {
  @Test func removingSharedCoinChangesMembershipKey() {
    let a = WatchlistGroup(id: "a", name: "A", slug: "a"), b = WatchlistGroup(id: "b", name: "B", slug: "b")
    var bootstrap = WatchlistsPageBootstrap(groups: [a, b], itemsByGroupId: [
      "a": [.init(id: "1", watchlistGroupId: "a", coinId: "bitcoin")],
      "b": [.init(id: "2", watchlistGroupId: "b", coinId: "bitcoin")]
    ])
    let before = bootstrap.membershipKey, coins = bootstrap.allCoinIds
    bootstrap.itemsByGroupId["a"] = []
    #expect(bootstrap.allCoinIds == coins)
    #expect(bootstrap.membershipKey != before)
  }
}
