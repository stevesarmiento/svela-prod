import Foundation
import Testing
@testable import AggrCore

@Suite struct ComparativeStatsTests {
  @Test func benchmarkRule() {
    #expect(ComparativeStats.pickBenchmarkIndex([("sol", 1), ("btc", 2)]) == 1)
    #expect(ComparativeStats.pickBenchmarkIndex([("sol", 1), ("eth", 2)]) == 1)
    #expect(ComparativeStats.pickBenchmarkIndex([("sol", 1), ("doge", 5)]) == 1)
  }

  @Test func correlationAndBeta() throws {
    let days = (0..<40).map { 1_700_000_000 + $0 * 86_400 }
    let a = days.enumerated().map { TimePoint(epochSeconds: $0.element, value: 100 * pow(1.01, Double($0.offset))) }
    let b = days.enumerated().map { TimePoint(epochSeconds: $0.element, value: 50 * pow(1.02, Double($0.offset))) }
    let r = try #require(ComparativeStats.compute([
      .init(id: "btc", symbol: "btc", name: "Bitcoin", marketCap: 2, series: a),
      .init(id: "x", symbol: "x", name: "X", marketCap: 1, series: b),
    ]))
    #expect(r.benchmarkSymbol == "btc")
    #expect(r.tokens[0].betaVsBenchmark == 1)
    // perfectly correlated constant-growth series (zero variance → nil correlation)
    #expect(r.correlationMatrix[0][0] == 1)
    #expect(abs((r.tokens[1].return7dPct ?? 0) - ((pow(1.02, 7) - 1) * 100)) < 1e-9)
    let md = ComparativeStats.format(r)
    #expect(md.contains("Benchmark: BTC"))
  }

  @Test func alignAxis() {
    let dense = (0..<5).map { TimePoint(epochSeconds: $0 * 10, value: Double($0)) }
    let sparse = [TimePoint(epochSeconds: 0, value: 0), TimePoint(epochSeconds: 40, value: 40)]
    let out = AggregateSeries.alignToSharedAxis(["d": (dense, false), "s": (sparse, false)])
    #expect(out["s"]?.map(\.value) == [0, 10, 20, 30, 40])
    #expect(AggregateSeries.returnSeries([TimePoint(epochSeconds: 1, value: 50), TimePoint(epochSeconds: 2, value: 75)]).last?.value == 50)
  }
}
