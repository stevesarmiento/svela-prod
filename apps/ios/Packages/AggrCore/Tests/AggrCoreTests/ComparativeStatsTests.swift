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

@Test func tokenStatsEncodeMissingValuesAsExplicitNulls() throws {
  let stats = ComparativeStats.TokenStats(
    id: "x", symbol: "X", name: "X token", marketCap: nil, return7dPct: 1.5, return30dPct: nil,
    excessReturn7dPct: nil, excessReturn30dPct: nil, volatility30dAnnualizedPct: nil, betaVsBenchmark: nil,
    rsi: nil, bbPercentB: nil, bbwpPct: nil, waveTrend: nil, moneyFlow: nil, openInterestChangePct: nil, takerBuyRatio: nil)
  let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(stats)) as? [String: Any]
  let object = try #require(json)
  // zod's `.nullable()` requires the key: a missing key is rejected as "Required".
  for key in ["marketCap", "return30dPct", "excessReturn7dPct", "excessReturn30dPct", "volatility30dAnnualizedPct",
              "betaVsBenchmark", "rsi", "bbPercentB", "bbwpPct", "waveTrend", "moneyFlow", "openInterestChangePct", "takerBuyRatio"] {
    #expect(object.keys.contains(key), "\(key) must be present")
    #expect(object[key] is NSNull, "\(key) must be null")
  }
  #expect(object["return7dPct"] as? Double == 1.5)
}
