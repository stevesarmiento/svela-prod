import Foundation
import Testing
@testable import AggrCore

// Ports of lib/overview-performance.test.ts and lib/overview-summary.test.ts
@Suite struct OverviewPerformanceTests {
  @Test func forwardFillKeepsFirstValidBucket() {
    let pts = OverviewPerformance.forwardFill(source: [.init(epochSeconds: 200, value: 1000), .init(epochSeconds: 400, value: 1200)], bucketTimesSec: [100, 200, 300, 400, 500])
    #expect(pts == [.init(epochSeconds: 200, value: 1000), .init(epochSeconds: 300, value: 1000), .init(epochSeconds: 400, value: 1200), .init(epochSeconds: 500, value: 1200)])
  }

  @Test func rebasedComparison() {
    let c = OverviewPerformance.buildRebasedComparison(
      portfolio: [.init(epochSeconds: 100, value: 50), .init(epochSeconds: 200, value: 100), .init(epochSeconds: 300, value: 110), .init(epochSeconds: 400, value: 120)],
      market: [.init(epochSeconds: 200, value: 1000), .init(epochSeconds: 300, value: 1050), .init(epochSeconds: 400, value: 1080)])
    #expect(c.baselineTime == 200)
    #expect(c.portfolioPoints.map(\.epochSeconds) == [200, 300, 400])
    #expect(abs(c.portfolioPoints[1].value - 110) < 1e-9)
    #expect(abs(c.marketPoints[2].value - 108) < 1e-9)
    #expect(abs((c.portfolioReturnPct ?? 0) - 20) < 1e-9)
    #expect(abs((c.marketReturnPct ?? 0) - 8) < 1e-9)
    #expect(abs((c.outperformancePct ?? 0) - 12) < 1e-9)
  }

  @Test func rebaseFromFirst() {
    #expect(OverviewPerformance.rebaseFromFirstPoint([.init(epochSeconds: 100, value: 25), .init(epochSeconds: 200, value: 30)]) == [.init(epochSeconds: 100, value: 100), .init(epochSeconds: 200, value: 120)])
  }

  @Test func breadth() throws {
    let b = try #require(BreadthStats.compute([3, -1, 0.2, 7, -6]))
    #expect(b.advancers == 2 && b.decliners == 2 && b.flat == 1 && b.bigMovers == 2)
    #expect(BreadthStats.compute([.nan]) == nil)
  }
}

@Suite struct OverviewSummaryTests {
  func render(_ s: [OverviewSummary.Segment]) -> String {
    s.map { seg -> String in
      switch seg { case .text(let t): t; case .pct(let v): "{\(OklchColor.jsNumberString(v))}" }
    }.joined()
  }

  @Test func valueWeighted() {
    #expect(OverviewSummary.valueWeighted24hChangePct([.init(valueUsd: 300, changePct: 10), .init(valueUsd: 100, changePct: -2)]) == 7)
    #expect(OverviewSummary.valueWeighted24hChangePct([.init(valueUsd: 100, changePct: 4), .init(valueUsd: 900, changePct: nil), .init(valueUsd: 500, changePct: .nan)]) == 4)
    #expect(OverviewSummary.valueWeighted24hChangePct([]) == nil)
    #expect(OverviewSummary.valueWeighted24hChangePct([.init(valueUsd: 0, changePct: 5)]) == nil)
  }

  @Test func seriesChange() {
    #expect(abs((OverviewSummary.seriesChangePct([.init(epochSeconds: 1, value: 100), .init(epochSeconds: 2, value: 90), .init(epochSeconds: 3, value: 110)]) ?? 0) - 10) < 1e-9)
    #expect(OverviewSummary.seriesChangePct([.init(epochSeconds: 1, value: 0), .init(epochSeconds: 2, value: 100)]) == nil)
  }

  @Test func sentimentLeans() {
    #expect(OverviewSummary.aggregateNewsSentiment([.bullish, .bullish, .bullish, .bearish]).lean == .bullish)
    #expect(OverviewSummary.aggregateNewsSentiment([.bullish, .bullish, .bearish]).lean == .mixed)
    #expect(OverviewSummary.aggregateNewsSentiment([.bearish, .bearish, .bearish, .bullish]).lean == .bearish)
    #expect(OverviewSummary.aggregateNewsSentiment([nil, nil]).lean == .quiet)
  }

  @Test func segments() {
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: 2.4, marketChangePct: 1.1, sentiment: nil, breadth: nil)) == "Your portfolio is up {2.4} today, ahead of the market's {1.1}.")
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: -3, marketChangePct: -1, sentiment: nil, breadth: nil)) == "Your portfolio is down {-3} today, behind the market's {-1}.")
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: 1.1, marketChangePct: 1.2, sentiment: nil, breadth: nil)) == "Your portfolio is up {1.1} today, in line with the market's {1.2}.")
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: 2, marketChangePct: nil, sentiment: nil, breadth: nil)) == "Your portfolio is up {2} over the last 24h; the market benchmark is still warming up.")
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: nil, marketChangePct: -0.8, sentiment: nil, breadth: nil)) == "The broader market is down {-0.8} over the last 24h.")
    #expect(OverviewSummary.buildSegments(portfolioChangePct: nil, marketChangePct: nil, sentiment: nil, breadth: nil).isEmpty)
    let bull = OverviewSummary.aggregateNewsSentiment([.bullish, .bullish, .bullish, .bearish, .neutral])
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: 1, marketChangePct: 2, sentiment: bull, breadth: nil)).contains("News flow around your coins leans bullish (3 of 5 stories)."))
    let breadth = BreadthStats(advancers: 6, decliners: 2, flat: 1, medianChangePct: 1.4, spreadPct: 5, bigMovers: 1)
    #expect(render(OverviewSummary.buildSegments(portfolioChangePct: nil, marketChangePct: nil, sentiment: OverviewSummary.aggregateNewsSentiment([]), breadth: breadth)) == "6 of 9 coins are trading higher over the last 24h.")
    let merged = OverviewSummary.buildSegments(portfolioChangePct: 1, marketChangePct: nil, sentiment: nil, breadth: BreadthStats(advancers: 1, decliners: 4, flat: 0, medianChangePct: -2, spreadPct: 4, bigMovers: 0))
    #expect(render(merged) == "Your portfolio is up {1} over the last 24h; the market benchmark is still warming up. 4 of 5 coins are trading lower over the last 24h.")
    for i in 1..<merged.count {
      if case .text = merged[i - 1], case .text = merged[i] { Issue.record("adjacent text segments") }
    }
  }

  @Test func feedHelpers() {
    #expect(FeedHelpers.relativeTime(ms: 0, nowMs: 30_000) == "just now")
    #expect(FeedHelpers.relativeTime(ms: 0, nowMs: 5 * 60_000) == "5m ago")
    #expect(FeedHelpers.relativeTime(ms: 0, nowMs: 3 * 3_600_000) == "3h ago")
    #expect(FeedHelpers.relativeTime(ms: 0, nowMs: 2 * 86_400_000) == "2d ago")
    #expect(FeedHelpers.breakoutTimeframeDays("New 30d high") == "30")
    #expect(FeedHelpers.categoryLabel("other") == nil)
  }
}
