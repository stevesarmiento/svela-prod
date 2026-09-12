import Foundation
import Testing
@testable import AggrCore

// Port of hooks/market-vision/pine-math.test.ts
@Suite struct PineMathTests {
  @Test func nzReplaces() {
    #expect(PineMath.nz(5) == 5)
    #expect(PineMath.nz(.nan) == 0)
    #expect(PineMath.nz(nil, 7) == 7)
  }

  @Test func smaWarmupAndValues() {
    let out = PineMath.sma([1, 2, 3, 4, 5], 3)
    #expect(out[0].isNaN && out[1].isNaN)
    #expect(Array(out[2...]) == [2, 3, 4])
  }

  @Test func smaPropagatesNaN() {
    let out = PineMath.sma([1, .nan, 3, 4, 5], 3)
    #expect(out[2].isNaN); #expect(out[3].isNaN); #expect(out[4] == 4)
  }

  @Test func emaSeedsWithSma() {
    let out = PineMath.ema([1, 2, 3, 4], 3)
    #expect(out[2] == 2)
    #expect(abs(out[3] - 3) < 1e-12)
  }

  @Test func highestLowest() {
    let v: [Double] = [3, 1, 4, 1, 5, 9, 2]
    #expect(Array(PineMath.highest(v, 3)[2...]) == [4, 4, 5, 9, 9])
    #expect(Array(PineMath.lowest(v, 3)[2...]) == [1, 1, 1, 1, 2])
  }

  @Test func rsiExtremes() {
    let up = PineMath.rsi([1, 2, 3, 4, 5, 6, 7], 3)
    #expect(up[2].isNaN); #expect(up[3] == 100); #expect(up[6] == 100)
    let down = PineMath.rsi([7, 6, 5, 4, 3, 2, 1], 3)
    #expect(down[6] == 0)
    let alt = PineMath.rsi([10, 11, 10, 11, 10, 11, 10, 11, 10, 11], 4)
    #expect(alt[9] > 40 && alt[9] < 60)
  }
}

@Suite struct TechnicalIndicatorTests {
  @Test func rsiMatchesReverse() {
    // Reverse RSI: solving for the price that produces target T must round-trip through rsi().
    let closes: [Double] = (0..<40).map { (i: Int) -> Double in
      let x = Double(i)
      return 100 + sin(x / 3) * 5 + x * 0.2
    }
    let period = 14
    let state = TechnicalIndicators.wilderRsiState(closes, period: period)!
    for target in TechnicalIndicators.defaultReverseRsiTargets {
      guard let price = TechnicalIndicators.reverseRsiPrice(state, period: period, target: target) else { continue }
      let next = TechnicalIndicators.rsi(closes + [price], period).last!
      #expect(abs(next - target) < 1e-6, "target \(target) got \(next)")
    }
  }

  @Test func reverseRsiRejectsUnreachable() {
    let state = TechnicalIndicators.WilderRsiState(avgGain: 1, avgLoss: 1, lastClose: 100)
    #expect(TechnicalIndicators.reverseRsiPrice(state, period: 14, target: 0) == nil)
    #expect(TechnicalIndicators.reverseRsiPrice(state, period: 14, target: 100) == nil)
    #expect(TechnicalIndicators.reverseRsiPrice(.init(avgGain: 0, avgLoss: 0, lastClose: 100), period: 14, target: 50) == nil)
  }

  @Test func hullSuiteProducesSeries() {
    let bars = (0..<120).map { (i: Int) -> OHLCVBar in
      let c: Double = 100 + sin(Double(i) / 5) * 3
      return OHLCVBar(time: 1_700_000_000 + i * 3600, open: 100, high: 101, low: 99, close: c)
    }
    let r = HullSuite.compute(bars, config: .tokenPage)
    #expect(r.mhull.count > 50)
    #expect(r.shull.count <= r.mhull.count)
    #expect(r.mhull.allSatisfy { $0.value.isFinite })
  }
}
