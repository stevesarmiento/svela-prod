import Foundation

/// Port of `hooks/market-vision/pine-math.ts`. Pine `na` semantics: NaN in, NaN out; arrays are full length.
public enum PineMath {
  @inline(__always) static func isFinite(_ v: Double) -> Bool { v.isFinite }

  public static func nz(_ value: Double?, _ replacement: Double = 0) -> Double {
    guard let value, value.isFinite else { return replacement }
    return value
  }

  public static func sma(_ values: [Double], _ length: Int) -> [Double] {
    let n = values.count
    var out = [Double](repeating: .nan, count: n)
    let period = max(1, length)
    guard n > 0 else { return out }
    for i in (period - 1)..<max(period - 1, n) where i < n {
      var sum = 0.0
      var broken = false
      for j in 0..<period {
        let v = values[i - j]
        if !v.isFinite { broken = true; break }
        sum += v
      }
      out[i] = broken ? .nan : sum / Double(period)
    }
    return out
  }

  public static func ema(_ values: [Double], _ length: Int) -> [Double] {
    let n = values.count
    var out = [Double](repeating: .nan, count: n)
    let period = max(1, length)
    guard n > 0 else { return out }
    let alpha = 2.0 / Double(period + 1)
    if n >= period {
      var seed = 0.0
      var broken = false
      for i in 0..<period { let v = values[i]; if !v.isFinite { broken = true; break }; seed += v }
      out[period - 1] = broken ? .nan : seed / Double(period)
    }
    var i = period
    while i < n {
      let v = values[i], prev = out[i - 1]
      if !v.isFinite { out[i] = prev.isFinite ? prev : .nan }
      else if !prev.isFinite { out[i] = v }
      else { out[i] = v * alpha + prev * (1 - alpha) }
      i += 1
    }
    return out
  }

  public static func highest(_ values: [Double], _ length: Int) -> [Double] {
    rolling(values, length, initial: -.infinity) { $0 > $1 ? $0 : $1 }
  }

  public static func lowest(_ values: [Double], _ length: Int) -> [Double] {
    rolling(values, length, initial: .infinity) { $0 < $1 ? $0 : $1 }
  }

  private static func rolling(_ values: [Double], _ length: Int, initial: Double, _ pick: (Double, Double) -> Double) -> [Double] {
    let n = values.count
    var out = [Double](repeating: .nan, count: n)
    let period = max(1, length)
    guard n > 0 else { return out }
    var i = period - 1
    while i < n {
      var acc = initial
      var broken = false
      for j in 0..<period {
        let v = values[i - j]
        if !v.isFinite { broken = true; break }
        acc = pick(v, acc)
      }
      out[i] = broken ? .nan : acc
      i += 1
    }
    return out
  }

  public static func rsi(_ values: [Double], _ length: Int) -> [Double] {
    let n = values.count
    var out = [Double](repeating: .nan, count: n)
    let period = max(1, length)
    guard n > period else { return out }
    var gainSum = 0.0, lossSum = 0.0
    for i in 1...period {
      let cur = values[i], prev = values[i - 1]
      guard cur.isFinite, prev.isFinite else { return out }
      let change = cur - prev
      if change >= 0 { gainSum += change } else { lossSum -= change }
    }
    var avgGain = gainSum / Double(period)
    var avgLoss = lossSum / Double(period)
    out[period] = avgLoss == 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    var i = period + 1
    while i < n {
      let cur = values[i], prev = values[i - 1]
      if !cur.isFinite || !prev.isFinite { out[i] = out[i - 1]; i += 1; continue }
      let change = cur - prev
      let gain = change > 0 ? change : 0
      let loss = change < 0 ? -change : 0
      avgGain = (avgGain * Double(period - 1) + gain) / Double(period)
      avgLoss = (avgLoss * Double(period - 1) + loss) / Double(period)
      out[i] = avgLoss == 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      i += 1
    }
    return out
  }
}
