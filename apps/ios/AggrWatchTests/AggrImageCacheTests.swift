import Foundation
import Testing
import UIKit
@testable import AggrWatch

@MainActor
struct AggrImageCacheTests {
  private static func png() -> Data {
    UIGraphicsImageRenderer(size: CGSize(width: 2, height: 2)).pngData { context in
      UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 2, height: 2))
    }
  }

  private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    func increment() { lock.lock(); value += 1; lock.unlock() }
    var count: Int { lock.lock(); defer { lock.unlock() }; return value }
  }

  @Test func decodesAndCachesInMemory() async {
    let counter = Counter()
    let data = Self.png()
    let cache = AggrImageCache(loader: { _ in counter.increment(); return data })
    let url = URL(string: "https://example.com/a.png")!
    #expect(cache.cachedImage(for: url) == nil)
    #expect(await cache.image(for: url) != nil)
    #expect(cache.cachedImage(for: url) != nil)
    #expect(await cache.image(for: url) != nil)
    #expect(counter.count == 1)
  }

  @Test func concurrentRequestsShareOneLoad() async {
    let counter = Counter()
    let data = Self.png()
    let cache = AggrImageCache(loader: { _ in
      counter.increment()
      try? await Task.sleep(for: .milliseconds(20))
      return data
    })
    let url = URL(string: "https://example.com/b.png")!
    async let first = cache.image(for: url)
    async let second = cache.image(for: url)
    let images = await [first, second]
    #expect(images.allSatisfy { $0 != nil })
    #expect(counter.count == 1)
  }

  @Test func failedLoadsBackOffUntilTheWindowPasses() async {
    let counter = Counter()
    nonisolated(unsafe) var clock = Date(timeIntervalSince1970: 1_000)
    let cache = AggrImageCache(loader: { _ in counter.increment(); throw URLError(.badServerResponse) },
                               now: { clock })
    let url = URL(string: "https://example.com/c.png")!
    #expect(await cache.image(for: url) == nil)
    #expect(await cache.image(for: url) == nil)
    #expect(counter.count == 1)
    clock = clock.addingTimeInterval(AggrImageCache.failureBackoff + 1)
    #expect(await cache.image(for: url) == nil)
    #expect(counter.count == 2)
  }

  @Test func thumbnailsPersistAcrossInstances() async {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let data = Self.png()
    let url = URL(string: "https://example.com/d.png")!
    let warm = AggrImageCache(loader: { _ in data }, thumbnailDirectory: directory)
    #expect(await warm.image(for: url) != nil)
    let cold = AggrImageCache(loader: { _ in throw URLError(.notConnectedToInternet) }, thumbnailDirectory: directory)
    // The synchronous peek is memory-only (no disk I/O in view bodies); the async path reads the thumbnail.
    #expect(cold.cachedImage(for: url) == nil)
    #expect(await cold.image(for: url) != nil)
    #expect(cold.cachedImage(for: url) != nil)
  }

  @Test func variantsAreCachedSeparately() async {
    let data = Self.png()
    let cache = AggrImageCache(loader: { _ in data })
    let url = URL(string: "https://example.com/e.png")!
    #expect(await cache.image(for: url, variant: .logo) != nil)
    #expect(cache.cachedImage(for: url, variant: .full) == nil)
    #expect(await cache.image(for: url, variant: .full) != nil)
    #expect(cache.cachedImage(for: url, variant: .full) != nil)
  }
}
