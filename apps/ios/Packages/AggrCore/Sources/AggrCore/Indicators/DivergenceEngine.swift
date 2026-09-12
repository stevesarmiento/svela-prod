import Foundation

/// Port of `divergence-engine.ts`: tolerance-pairing divergence finder.
public enum DivergenceType: String, Sendable, Codable, Hashable { case bullish, bearish, h_bullish, h_bearish
  public var isBullish: Bool { self == .bullish || self == .h_bullish }
}

public struct PairedDivergence: Sendable, Hashable {
  public var type: DivergenceType
  public var startIndex: Int
  public var endIndex: Int
  public var oscStart: Double
  public var oscEnd: Double
  public var priceStart: Double
  public var priceEnd: Double
}

public enum PairMode: String, Sendable, Codable { case tvLike = "TV-like", sameBar = "Same Bar" }

public struct DivergenceEngineConfig: Sendable, Hashable {
  public var leftBars: Int
  public var rightBars: Int
  public var pairMode: PairMode
  public var tolBars: Int
  public var allowEqual: Bool
  public var priceEps: Double
  public var oscEps: Double
  public var showRegular: Bool
  public var showHidden: Bool
  public init(leftBars: Int, rightBars: Int, pairMode: PairMode, tolBars: Int, allowEqual: Bool, priceEps: Double, oscEps: Double, showRegular: Bool, showHidden: Bool) {
    self.leftBars = leftBars; self.rightBars = rightBars; self.pairMode = pairMode; self.tolBars = tolBars; self.allowEqual = allowEqual
    self.priceEps = priceEps; self.oscEps = oscEps; self.showRegular = showRegular; self.showHidden = showHidden
  }
}

public enum DivergenceEngine {
  static func greater(_ a: Double, _ b: Double, _ eps: Double, _ allowEqual: Bool) -> Bool { allowEqual ? a >= b - eps : a > b + eps }
  static func less(_ a: Double, _ b: Double, _ eps: Double, _ allowEqual: Bool) -> Bool { allowEqual ? a <= b + eps : a < b - eps }

  public static func pivotHighAt(_ values: [Double], leftBars: Int, rightBars: Int, currentIndex: Int) -> Double? {
    let p = currentIndex - rightBars
    guard p - leftBars >= 0, p + rightBars < values.count else { return nil }
    let pv = values[p]
    guard pv.isFinite else { return nil }
    for i in (p - leftBars)...(p + rightBars) where i != p {
      let v = values[i]
      if !v.isFinite || v >= pv { return nil }
    }
    return pv
  }

  public static func pivotLowAt(_ values: [Double], leftBars: Int, rightBars: Int, currentIndex: Int) -> Double? {
    let p = currentIndex - rightBars
    guard p - leftBars >= 0, p + rightBars < values.count else { return nil }
    let pv = values[p]
    guard pv.isFinite else { return nil }
    for i in (p - leftBars)...(p + rightBars) where i != p {
      let v = values[i]
      if !v.isFinite || v <= pv { return nil }
    }
    return pv
  }

  static func expirePending(_ now: Int?, _ pend: Int?, _ tol: Int) -> Bool {
    guard let now, let pend else { return false }
    return now - pend > tol
  }

  public static func findPairedDivergences(highs: [Double], lows: [Double], osc: [Double], config c: DivergenceEngineConfig) -> [PairedDivergence] {
    var out: [PairedDivergence] = []
    let n = min(highs.count, lows.count, osc.count)
    var pendRhiIx: Int? = nil, pendRhi: Double? = nil, pendPhiIx: Int? = nil, pendPhi: Double? = nil
    var pendRloIx: Int? = nil, pendRlo: Double? = nil, pendPloIx: Int? = nil, pendPlo: Double? = nil
    var prevHighPH: Double? = nil, prevHighRH: Double? = nil, prevHighIx: Int? = nil
    var prevLowPL: Double? = nil, prevLowRL: Double? = nil, prevLowIx: Int? = nil

    for i in 0..<n {
      let ph = pivotHighAt(highs, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i)
      let pl = pivotLowAt(lows, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i)
      let rh = pivotHighAt(osc, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i)
      let rl = pivotLowAt(osc, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i)
      let phix: Int? = ph == nil ? nil : i - c.rightBars
      let plix: Int? = pl == nil ? nil : i - c.rightBars
      let rhix: Int? = rh == nil ? nil : i - c.rightBars
      let rlix: Int? = rl == nil ? nil : i - c.rightBars

      if rhix != nil, expirePending(rhix, pendPhiIx, c.tolBars) { pendPhiIx = nil; pendPhi = nil }
      if phix != nil, expirePending(phix, pendRhiIx, c.tolBars) { pendRhiIx = nil; pendRhi = nil }
      if rlix != nil, expirePending(rlix, pendPloIx, c.tolBars) { pendPloIx = nil; pendPlo = nil }
      if plix != nil, expirePending(plix, pendRloIx, c.tolBars) { pendRloIx = nil; pendRlo = nil }

      // High side
      var pairHighNow = false
      var curHighPH: Double? = nil, curHighRH: Double? = nil, curHighIx: Int? = nil
      let phNow = ph != nil, rhNow = rh != nil
      if c.pairMode == .sameBar {
        if phNow, rhNow, phix == rhix { pairHighNow = true; curHighPH = ph; curHighRH = rh; curHighIx = rhix }
      } else {
        if phNow, rhNow, abs(phix! - rhix!) <= c.tolBars {
          pairHighNow = true; curHighPH = ph; curHighRH = rh; curHighIx = rhix
        } else {
          if rhNow {
            if let pIx = pendPhiIx, let pv = pendPhi, abs(pIx - rhix!) <= c.tolBars {
              pairHighNow = true; curHighPH = pv; curHighRH = rh; curHighIx = rhix; pendPhiIx = nil; pendPhi = nil
            } else { pendRhiIx = rhix; pendRhi = rh }
          }
          if phNow, !pairHighNow {
            if let rIx = pendRhiIx, let rv = pendRhi, abs(rIx - phix!) <= c.tolBars {
              pairHighNow = true; curHighPH = ph; curHighRH = rv; curHighIx = rIx; pendRhiIx = nil; pendRhi = nil
            } else { pendPhiIx = phix; pendPhi = ph }
          }
        }
      }

      // Low side
      var pairLowNow = false
      var curLowPL: Double? = nil, curLowRL: Double? = nil, curLowIx: Int? = nil
      let plNow = pl != nil, rlNow = rl != nil
      if c.pairMode == .sameBar {
        if plNow, rlNow, plix == rlix { pairLowNow = true; curLowPL = pl; curLowRL = rl; curLowIx = rlix }
      } else {
        if plNow, rlNow, abs(plix! - rlix!) <= c.tolBars {
          pairLowNow = true; curLowPL = pl; curLowRL = rl; curLowIx = rlix
        } else {
          if rlNow {
            if let pIx = pendPloIx, let pv = pendPlo, abs(pIx - rlix!) <= c.tolBars {
              pairLowNow = true; curLowPL = pv; curLowRL = rl; curLowIx = rlix; pendPloIx = nil; pendPlo = nil
            } else { pendRloIx = rlix; pendRlo = rl }
          }
          if plNow, !pairLowNow {
            if let rIx = pendRloIx, let rv = pendRlo, abs(rIx - plix!) <= c.tolBars {
              pairLowNow = true; curLowPL = pl; curLowRL = rv; curLowIx = rIx; pendRloIx = nil; pendRlo = nil
            } else { pendPloIx = plix; pendPlo = pl }
          }
        }
      }

      if pairHighNow, let cIx = curHighIx, let cPH = curHighPH, let cRH = curHighRH, let pIx = prevHighIx, let pPH = prevHighPH, let pRH = prevHighRH {
        let bearReg = c.showRegular && greater(cPH, pPH, c.priceEps, c.allowEqual) && less(cRH, pRH, c.oscEps, c.allowEqual)
        let bearHid = c.showHidden && less(cPH, pPH, c.priceEps, c.allowEqual) && greater(cRH, pRH, c.oscEps, c.allowEqual)
        if bearReg || bearHid {
          out.append(PairedDivergence(type: bearReg ? .bearish : .h_bearish, startIndex: pIx, endIndex: cIx, oscStart: pRH, oscEnd: cRH, priceStart: pPH, priceEnd: cPH))
        }
      }
      if pairLowNow, let cIx = curLowIx, let cPL = curLowPL, let cRL = curLowRL, let pIx = prevLowIx, let pPL = prevLowPL, let pRL = prevLowRL {
        let bullReg = c.showRegular && less(cPL, pPL, c.priceEps, c.allowEqual) && greater(cRL, pRL, c.oscEps, c.allowEqual)
        let bullHid = c.showHidden && greater(cPL, pPL, c.priceEps, c.allowEqual) && less(cRL, pRL, c.oscEps, c.allowEqual)
        if bullReg || bullHid {
          out.append(PairedDivergence(type: bullReg ? .bullish : .h_bullish, startIndex: pIx, endIndex: cIx, oscStart: pRL, oscEnd: cRL, priceStart: pPL, priceEnd: cPL))
        }
      }
      if pairHighNow, let cIx = curHighIx, let cPH = curHighPH, let cRH = curHighRH { prevHighPH = cPH; prevHighRH = cRH; prevHighIx = cIx }
      if pairLowNow, let cIx = curLowIx, let cPL = curLowPL, let cRL = curLowRL { prevLowPL = cPL; prevLowRL = cRL; prevLowIx = cIx }
    }
    return out
  }
}
