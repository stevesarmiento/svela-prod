import Testing
@testable import AggrCore

@Suite struct MarketFeedTests {
  @Test func sizes() {
    #expect(MarketFeed.sanitizeSize(nil) == 25 && MarketFeed.sanitizeSize(100) == 25 && MarketFeed.sanitizeSize(50) == 50)
    #expect(MarketFeed.nextSize(15) == 25 && MarketFeed.nextSize(25) == 50 && MarketFeed.nextSize(50) == 15)
    #expect(MarketFeed.isValidSize(15) && !MarketFeed.isValidSize(20))
  }
  @Test func lastSeen() {
    #expect(MarketFeed.sanitizeLastSeen(["bitcoin": 1000, "zero": 0, "neg": -5, "inf": .infinity]) == ["bitcoin": 1000])
    let first = MarketFeed.recordLastSeen([:], coinId: "bitcoin", seenAtMs: 1000)
    #expect(first == ["bitcoin": 1000])
    #expect(MarketFeed.recordLastSeen(first, coinId: "bitcoin", seenAtMs: 500) == ["bitcoin": 1000])
    #expect(MarketFeed.recordLastSeen(first, coinId: "bitcoin", seenAtMs: 2000) == ["bitcoin": 2000])
    #expect(MarketFeed.recordLastSeen(["bitcoin": 1], coinId: "", seenAtMs: 1000) == ["bitcoin": 1])
    #expect(MarketFeed.recordLastSeen(["a": 10, "b": 20, "c": 30], coinId: "d", seenAtMs: 40, limit: 3) == ["b": 20, "c": 30, "d": 40])
    #expect(MarketFeed.countUnseen(postedAtMs: [100, 200, 300, nil], lastSeenMs: 150) == 2)
    #expect(MarketFeed.countUnseen(postedAtMs: [100, 200], lastSeenMs: 200) == 0)
  }
}
