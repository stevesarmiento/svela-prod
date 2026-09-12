import Foundation

/// Port of `vmc-divergences.ts` (Pine fractal parity; confirmation at pivot + 2).
public struct VmcDivsResult: Sendable {
  public var fractalTop: [Bool], fractalBot: [Bool]
  public var prevTopPivotIndex: [Int?], prevTopSrc: [Double], prevTopPriceHigh: [Double]
  public var prevBotPivotIndex: [Int?], prevBotSrc: [Double], prevBotPriceLow: [Double]
  public var bearDiv: [Bool], bullDiv: [Bool], bearHidden: [Bool], bullHidden: [Bool]
}

public enum VmcDivergences {
  static func topFractal(_ s: [Double], _ p: Int) -> Bool {
    let s0 = s[p - 2], s1 = s[p - 1], s2 = s[p], s3 = s[p + 1], s4 = s[p + 2]
    guard s0.isFinite, s1.isFinite, s2.isFinite, s3.isFinite, s4.isFinite else { return false }
    return s0 < s2 && s1 < s2 && s2 > s3 && s2 > s4
  }
  static func botFractal(_ s: [Double], _ p: Int) -> Bool {
    let s0 = s[p - 2], s1 = s[p - 1], s2 = s[p], s3 = s[p + 1], s4 = s[p + 2]
    guard s0.isFinite, s1.isFinite, s2.isFinite, s3.isFinite, s4.isFinite else { return false }
    return s0 > s2 && s1 > s2 && s2 < s3 && s2 < s4
  }

  public static func find(src: [Double], priceHigh: [Double], priceLow: [Double], topLimit: Double, botLimit: Double, useLimits: Bool) -> VmcDivsResult {
    let n = max(src.count, priceHigh.count, priceLow.count)
    var r = VmcDivsResult(fractalTop: .init(repeating: false, count: n), fractalBot: .init(repeating: false, count: n),
                          prevTopPivotIndex: .init(repeating: nil, count: n), prevTopSrc: .init(repeating: .nan, count: n), prevTopPriceHigh: .init(repeating: .nan, count: n),
                          prevBotPivotIndex: .init(repeating: nil, count: n), prevBotSrc: .init(repeating: .nan, count: n), prevBotPriceLow: .init(repeating: .nan, count: n),
                          bearDiv: .init(repeating: false, count: n), bullDiv: .init(repeating: false, count: n), bearHidden: .init(repeating: false, count: n), bullHidden: .init(repeating: false, count: n))
    var lastTop: Int? = nil, lastBot: Int? = nil
    guard n > 4 else { return r }
    for p in 2..<(n - 2) {
      let confirm = p + 2
      guard p < src.count, p + 2 < src.count else { continue }
      let sp = src[p]
      guard sp.isFinite else { continue }
      if topFractal(src, p) && (!useLimits || sp >= topLimit) {
        r.fractalTop[confirm] = true
        if let lt = lastTop {
          r.prevTopPivotIndex[confirm] = lt
          let prevSrc = src[lt], prevHigh = lt < priceHigh.count ? priceHigh[lt] : .nan
          if prevSrc.isFinite { r.prevTopSrc[confirm] = prevSrc }
          if prevHigh.isFinite { r.prevTopPriceHigh[confirm] = prevHigh }
          let curHigh = p < priceHigh.count ? priceHigh[p] : .nan
          if curHigh.isFinite, prevHigh.isFinite, prevSrc.isFinite {
            r.bearDiv[confirm] = curHigh > prevHigh && sp < prevSrc
            r.bearHidden[confirm] = curHigh < prevHigh && sp > prevSrc
          }
        }
        lastTop = p
      }
      if botFractal(src, p) && (!useLimits || sp <= botLimit) {
        r.fractalBot[confirm] = true
        if let lb = lastBot {
          r.prevBotPivotIndex[confirm] = lb
          let prevSrc = src[lb], prevLow = lb < priceLow.count ? priceLow[lb] : .nan
          if prevSrc.isFinite { r.prevBotSrc[confirm] = prevSrc }
          if prevLow.isFinite { r.prevBotPriceLow[confirm] = prevLow }
          let curLow = p < priceLow.count ? priceLow[p] : .nan
          if curLow.isFinite, prevLow.isFinite, prevSrc.isFinite {
            r.bullDiv[confirm] = curLow < prevLow && sp > prevSrc
            r.bullHidden[confirm] = curLow > prevLow && sp < prevSrc
          }
        }
        lastBot = p
      }
    }
    return r
  }
}
