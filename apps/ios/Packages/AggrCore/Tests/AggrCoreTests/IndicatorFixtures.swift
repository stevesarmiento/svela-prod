import Foundation
@testable import AggrCore

/// Port of `hooks/market-vision/test-fixtures.ts` — mulberry32 PRNG + synthetic hourly bars (bit-exact).
enum IndicatorFixtures {
  static func mulberry32(_ seed: UInt32) -> () -> Double {
    var a = seed
    return {
      a = a &+ 0x6d2b_79f5
      var t = a
      t = (t ^ (t >> 15)) &* (t | 1)
      t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
      return Double(t ^ (t >> 14)) / 4_294_967_296
    }
  }

  static func bars(count: Int = 400, seed: UInt32 = 42) -> [OHLCVBar] {
    let rand = mulberry32(seed)
    var out: [OHLCVBar] = []
    let t0 = 1_700_000_000, barSeconds = 3600
    var price = 100.0
    for i in 0..<count {
      let wave = 8 * sin(Double(i) / 12) + 4 * sin(Double(i) / 5.3)
      let drift = Double(i) * 0.03
      let noise = (rand() - 0.5) * 2.2
      let close = 100 + wave + drift + noise
      let open = price
      let spread = 0.6 + rand() * 1.4
      let high = max(open, close) + spread * rand()
      let low = min(open, close) - spread * rand()
      out.append(OHLCVBar(time: t0 + i * barSeconds, open: open, high: high, low: low, close: close, volume: 1000 + (rand() * 500).rounded(.down)))
      price = close
    }
    return out
  }
}
