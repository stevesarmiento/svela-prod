import Foundation

/// Port of `vmc-patterns.ts`.
public enum VmcPatterns {
  public static func macdWtColors(hrsimfi: [Double], macd: [Double], signal: [Double], wt1a: String, wt1b: String, wt1c: String, wt1d: String, wt2a: String, wt2b: String, wt2c: String, wt2d: String) -> (wt1: [String?], wt2: [String?]) {
    let n = max(hrsimfi.count, macd.count, signal.count)
    var c1 = [String?](repeating: nil, count: n), c2 = c1
    for i in 0..<n {
      guard i < macd.count, i < signal.count, i < hrsimfi.count else { continue }
      let m = macd[i], s = signal[i], mf = hrsimfi[i]
      guard m.isFinite, s.isFinite, mf.isFinite else { continue }
      if m >= s { c1[i] = mf > 0 ? wt1c : wt1a; c2[i] = mf < 0 ? wt2c : wt2a }
      else if m <= s { c1[i] = mf < 0 ? wt1d : wt1b; c2[i] = mf < 0 ? wt2d : wt2b }
    }
    return (c1, c2)
  }

  public static func sommiFlag(rsimfi: [Double], wt2: [Double], wtCross: [Bool], wtCrossUp: [Bool], wtCrossDown: [Bool], hwtVwap: [Double],
                               rsiMfiBear: Double, rsiMfiBull: Double, wtBear: Double, wtBull: Double, vwapBear: Double, vwapBull: Double) -> (bearish: [Bool], bullish: [Bool], hvwapEma3: [Double]) {
    let n = max(rsimfi.count, wt2.count, hwtVwap.count, wtCross.count)
    var bear = [Bool](repeating: false, count: n), bull = bear
    for i in 0..<n {
      guard i < rsimfi.count, i < wt2.count, i < hwtVwap.count else { continue }
      let mf = rsimfi[i], w = wt2[i], h = hwtVwap[i]
      guard mf.isFinite, w.isFinite, h.isFinite else { continue }
      let cross = i < wtCross.count && wtCross[i]
      bear[i] = mf < rsiMfiBear && w > wtBear && cross && (i < wtCrossDown.count && wtCrossDown[i]) && h < vwapBear
      bull[i] = mf > rsiMfiBull && w < wtBull && cross && (i < wtCrossUp.count && wtCrossUp[i]) && h > vwapBull
    }
    return (bear, bull, PineMath.ema(hwtVwap, 3))
  }

  public static func sommiDiamond(wt2: [Double], wtCross: [Bool], wtCrossUp: [Bool], wtCrossDown: [Bool], dir1: [Bool], dir2: [Bool], bearLevel: Double, bullLevel: Double) -> (bearish: [Bool], bullish: [Bool]) {
    let n = max(wt2.count, wtCross.count, dir1.count, dir2.count)
    var bear = [Bool](repeating: false, count: n), bull = bear
    for i in 0..<n {
      guard i < wt2.count, wt2[i].isFinite else { continue }
      let cross = i < wtCross.count && wtCross[i]
      let d1 = i < dir1.count && dir1[i], d2 = i < dir2.count && dir2[i]
      bear[i] = wt2[i] >= bearLevel && cross && (i < wtCrossDown.count && wtCrossDown[i]) && !d1 && !d2
      bull[i] = wt2[i] <= bullLevel && cross && (i < wtCrossUp.count && wtCrossUp[i]) && d1 && d2
    }
    return (bear, bull)
  }
}
