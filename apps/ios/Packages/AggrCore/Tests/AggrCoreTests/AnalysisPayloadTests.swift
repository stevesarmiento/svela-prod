import Foundation
import Testing
@testable import AggrCore

@Suite struct AnalysisPayloadTests {
  @Test func syntheticOhlcv() {
    let chart = [TimePoint(epochSeconds: 0, value: 100), TimePoint(epochSeconds: 3600, value: 110)]
    let bars = AnalysisPayload.syntheticOHLCV(chart: chart, volume: [TimePoint(epochSeconds: 0, value: 5)])
    #expect(bars[0].open == 100 && bars[0].close == 100 && bars[0].volume == 5)
    let vol = abs(110.0 - 100) * 0.3 + 110 * 0.001
    #expect(abs(bars[1].high - (110 + vol / 2)) < 1e-9 && abs(bars[1].low - (100 - vol / 2)) < 1e-9)
  }

  @Test func derive() {
    let bars = IndicatorFixtures.bars(count: 200, seed: 42)
    let chart = bars.map { TimePoint(epochSeconds: $0.time, value: $0.close) }
    let vol = bars.map { TimePoint(epochSeconds: $0.time, value: $0.volume) }
    let d = AnalysisPayload.derive(chart: chart, volume: vol, market: .init(name: "X", symbol: "x", price: chart.last!.value, change24h: 1, marketCap: 1, volume24h: 1))
    #expect(d.priceHistory.count == 30 && d.rsiHistory.count <= 30)
    #expect(["bullish", "bearish"].contains(d.momentum ?? ""))
    #expect(d.support! <= d.resistance!)
    #expect(d.reverseLevels.count == 5)
    #expect(d.hasWaveTrend)
  }
}
