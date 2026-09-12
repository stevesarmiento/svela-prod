import Foundation

/// Port of `vmc-core.ts`.
public enum VmcCore {
  public struct WaveTrend: Sendable {
    public var wt1: [Double], wt2: [Double], wtVwap: [Double]
    public var wtCross: [Bool], wtCrossUp: [Bool], wtCrossDown: [Bool]
    public var wtCrossLast: [Bool], wtCrossUpLast: [Bool], wtCrossDownLast: [Bool]
  }

  public static func rsiMfi(_ bars: [OHLCVBar], period: Int, multiplier: Double, posY: Double) -> [Double] {
    var values = [Double](repeating: 0, count: bars.count)
    for (i, c) in bars.enumerated() {
      guard c.open.isFinite, c.high.isFinite, c.low.isFinite, c.close.isFinite else { values[i] = .nan; continue }
      let range = c.high - c.low
      if range == 0 { values[i] = 0; continue }
      let ratio = max(-1, min(1, (c.close - c.open) / range))
      values[i] = ratio * multiplier
    }
    return PineMath.sma(values, period).map { ($0.isFinite ? $0 : .nan) - posY }
  }

  public static func waveTrend(_ sources: CandleSources, source: VmcSource, channelLen: Int, averageLen: Int, maLen: Int) -> WaveTrend {
    let src = sources.series(source)
    let esa = PineMath.ema(src, channelLen)
    let absDiff = zip(src, esa).map { (s, e) in (s.isFinite && e.isFinite) ? abs(s - e) : .nan }
    let de = PineMath.ema(absDiff, channelLen)
    var ci = [Double](repeating: .nan, count: src.count)
    for i in 0..<src.count {
      let s = src[i], e = esa[i], d = de[i]
      if s.isFinite, e.isFinite, d.isFinite, d != 0 { ci[i] = (s - e) / (0.015 * d) }
    }
    let wt1 = PineMath.ema(ci, averageLen)
    let wt2 = PineMath.sma(wt1, maLen)
    let wtVwap = zip(wt1, wt2).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    let wtCross = PineSeries.cross(wt1, wt2)
    var up = [Bool](repeating: false, count: wt1.count), down = up
    for i in 0..<wt1.count where wt1[i].isFinite && wt2[i].isFinite {
      up[i] = wt2[i] - wt1[i] <= 0
      down[i] = wt2[i] - wt1[i] >= 0
    }
    var crossLast = [Bool](repeating: false, count: wt1.count), upLast = crossLast, downLast = crossLast
    if wt1.count > 2 { for i in 2..<wt1.count { crossLast[i] = wtCross[i - 2]; upLast[i] = up[i - 2]; downLast[i] = down[i - 2] } }
    return WaveTrend(wt1: wt1, wt2: wt2, wtVwap: wtVwap, wtCross: wtCross, wtCrossUp: up, wtCrossDown: down, wtCrossLast: crossLast, wtCrossUpLast: upLast, wtCrossDownLast: downLast)
  }

  public static func stochRsi(_ src: [Double], stochLen: Int, rsiLen: Int, kSmooth: Int, dSmooth: Int, useLog: Bool, useAvg: Bool) -> (k: [Double], d: [Double]) {
    let series = useLog ? src.map { $0 > 0 ? log($0) : 0 } : src
    let rsiValues = PineMath.rsi(series, rsiLen)
    let hh = PineMath.highest(rsiValues, stochLen), ll = PineMath.lowest(rsiValues, stochLen)
    var raw = [Double](repeating: 50, count: rsiValues.count)
    for i in 0..<rsiValues.count {
      let h = hh[i], l = ll[i], v = rsiValues[i]
      if h.isFinite, l.isFinite, v.isFinite, h != l { raw[i] = (v - l) / (h - l) * 100 }
    }
    let kk = PineMath.sma(raw, kSmooth)
    let d1 = PineMath.sma(kk, dSmooth)
    var kOut = [Double](repeating: 0, count: kk.count)
    for i in 0..<kk.count {
      if useAvg, kk[i].isFinite, d1[i].isFinite { kOut[i] = (kk[i] + d1[i]) / 2 } else { kOut[i] = kk[i] }
    }
    return (kOut, d1)
  }

  public static func schaffTc(_ src: [Double], length: Int, fastLength: Int, slowLength: Int, factor: Double) -> [Double] {
    let n = src.count
    let ema1 = PineMath.ema(src, fastLength), ema2 = PineMath.ema(src, slowLength)
    let macd = zip(ema1, ema2).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    let alpha = PineMath.lowest(macd, length), hMacd = PineMath.highest(macd, length)
    let beta = zip(hMacd, alpha).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    var gamma = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let b = beta[i], a = alpha[i], m = macd[i]
      let prev = i > 0 ? gamma[i - 1] : Double.nan
      gamma[i] = (b.isFinite && b > 0 && a.isFinite && m.isFinite) ? (m - a) / b * 100 : PineMath.nz(prev, 0)
    }
    var delta = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let g = gamma[i]
      if i == 0 || !delta[i - 1].isFinite { delta[i] = g } else { delta[i] = delta[i - 1] + factor * (g - delta[i - 1]) }
    }
    let epsilon = PineMath.lowest(delta, length), hDelta = PineMath.highest(delta, length)
    let zeta = zip(hDelta, epsilon).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    var eta = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let z = zeta[i], e = epsilon[i], d = delta[i]
      let prev = i > 0 ? eta[i - 1] : Double.nan
      eta[i] = (z.isFinite && z > 0 && e.isFinite && d.isFinite) ? (d - e) / z * 100 : PineMath.nz(prev, 0)
    }
    var stc = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let e = eta[i]
      if i == 0 || !stc[i - 1].isFinite { stc[i] = e } else { stc[i] = stc[i - 1] + factor * (e - stc[i - 1]) }
    }
    return stc
  }

  public static func macd(_ src: [Double], fastLen: Int, slowLen: Int, sigSmooth: Int) -> (macd: [Double], signal: [Double], hist: [Double]) {
    let fast = PineMath.ema(src, fastLen), slow = PineMath.ema(src, slowLen)
    let macd = zip(fast, slow).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    let signal = PineMath.sma(macd, sigSmooth)
    let hist = zip(macd, signal).map { ($0.isFinite && $1.isFinite) ? $0 - $1 : .nan }
    return (macd, signal, hist)
  }
}
