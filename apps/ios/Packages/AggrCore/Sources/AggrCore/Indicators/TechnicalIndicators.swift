import Foundation

/// Port of `hooks/market-vision/technical-indicators.ts` — the LENIENT family (warmup → 0, skips non-finite
/// values). Distinct from `PineMath` (NaN-propagating). Keep both; different indicators rely on each.
public enum TechnicalIndicators {
  @inline(__always) static func ok(_ v: Double) -> Bool { v.isFinite }

  public static func sma(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < data.count {
      var sum = 0.0, count = 0
      for j in 0..<period { let v = data[i - j]; if ok(v) { sum += v; count += 1 } }
      result[i] = count > 0 ? sum / Double(count) : 0
      i += 1
    }
    return result
  }

  public static func ema(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard !data.isEmpty else { return result }
    let multiplier = 2.0 / Double(period + 1)
    var first = 0
    while first < data.count && !ok(data[first]) { first += 1 }
    guard first < data.count else { return result }
    result[first] = data[first]
    var i = first + 1
    while i < data.count {
      let v = data[i], prev = result[i - 1]
      result[i] = (ok(v) && ok(prev)) ? v * multiplier + prev * (1 - multiplier) : prev
      i += 1
    }
    return result
  }

  public static func rma(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard !data.isEmpty, period >= 1 else { return result }
    var sum = 0.0, count = 0
    for i in 0..<min(period, data.count) { let v = data[i]; if ok(v) { sum += v; count += 1 } }
    if period - 1 < data.count { result[period - 1] = count > 0 ? sum / Double(count) : 0 }
    var i = period
    while i < data.count {
      let v = data[i], prev = result[i - 1]
      result[i] = (ok(v) && ok(prev)) ? (prev * Double(period - 1) + v) / Double(period) : prev
      i += 1
    }
    return result
  }

  public static func wma(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < data.count {
      var sum = 0.0, weightSum = 0.0
      for j in 0..<period { let v = data[i - j]; if ok(v) { let w = Double(period - j); sum += v * w; weightSum += w } }
      result[i] = weightSum > 0 ? sum / weightSum : 0
      i += 1
    }
    return result
  }

  public static func hullMA(_ data: [Double], _ period: Int) -> [Double] {
    let half = period / 2
    let sqrtLen = Int((Double(period)).squareRoot().rounded())
    let w1 = wma(data, half), w2 = wma(data, period)
    var diff = [Double](repeating: 0, count: data.count)
    for i in 0..<data.count { diff[i] = 2 * w1[i] - w2[i] }
    return wma(diff, sqrtLen)
  }

  public static func vwma(_ prices: [Double], _ volumes: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: prices.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < prices.count {
      var pv = 0.0, vs = 0.0
      for j in 0..<period where i - j < volumes.count {
        let p = prices[i - j], v = volumes[i - j]
        if ok(p) && ok(v) { pv += p * v; vs += v }
      }
      result[i] = vs > 0 ? pv / vs : 0
      i += 1
    }
    return result
  }

  public static func rsi(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard data.count > 1 else { return result }
    var gains: [Double] = [], losses: [Double] = []
    gains.reserveCapacity(data.count - 1); losses.reserveCapacity(data.count - 1)
    for i in 1..<data.count {
      let change = data[i] - data[i - 1]
      gains.append(change > 0 ? change : 0)
      losses.append(change < 0 ? -change : 0)
    }
    let avgGains = rma(gains, period), avgLosses = rma(losses, period)
    for i in 0..<avgGains.count {
      let gain = avgGains[i], loss = avgLosses[i]
      result[i + 1] = loss == 0 ? 100 : 100 - 100 / (1 + gain / loss)
    }
    return result
  }

  public static func stdev(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < data.count {
      let slice = data[(i - period + 1)...i].filter(ok)
      if slice.isEmpty { result[i] = 0; i += 1; continue }
      let mean = slice.reduce(0, +) / Double(slice.count)
      let variance = slice.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(slice.count)
      result[i] = variance.squareRoot()
      i += 1
    }
    return result
  }

  public static func sum(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: 0, count: data.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < data.count {
      var total = 0.0
      for j in 0..<period { let v = data[i - j]; if ok(v) { total += v } }
      result[i] = total
      i += 1
    }
    return result
  }

  // MARK: Reverse RSI (Siligardos), consistent with rsi() above.

  public struct WilderRsiState: Sendable, Equatable {
    public var avgGain: Double
    public var avgLoss: Double
    public var lastClose: Double
    public init(avgGain: Double, avgLoss: Double, lastClose: Double) { self.avgGain = avgGain; self.avgLoss = avgLoss; self.lastClose = lastClose }
  }

  public static func wilderRsiState(_ closes: [Double], period: Int) -> WilderRsiState? {
    guard period >= 1, closes.count >= period + 1, let last = closes.last, last.isFinite else { return nil }
    var gains: [Double] = [], losses: [Double] = []
    for i in 1..<closes.count {
      let change = closes[i] - closes[i - 1]
      gains.append(change > 0 ? change : 0)
      losses.append(change < 0 ? -change : 0)
    }
    let g = rma(gains, period)[gains.count - 1], l = rma(losses, period)[losses.count - 1]
    guard g.isFinite, l.isFinite else { return nil }
    return WilderRsiState(avgGain: g, avgLoss: l, lastClose: last)
  }

  public static let defaultReverseRsiTargets: [Double] = [80, 62, 50, 38, 20]

  public struct ReverseRsiLevel: Sendable, Hashable {
    public var target: Double
    public var price: Double?
  }

  public static func reverseRsiPrice(_ state: WilderRsiState, period: Int, target: Double) -> Double? {
    guard period >= 1, target.isFinite, target > 0, target < 100 else { return nil }
    guard state.avgGain.isFinite, state.avgLoss.isFinite, state.lastClose.isFinite else { return nil }
    if state.avgGain <= 0 && state.avgLoss <= 0 { return nil }
    let rs = target / (100 - target)
    let p = Double(period - 1)
    let price = rs * state.avgLoss >= state.avgGain
      ? state.lastClose + p * (rs * state.avgLoss - state.avgGain)
      : state.lastClose - p * (state.avgGain / rs - state.avgLoss)
    return price.isFinite && price > 0 ? price : nil
  }

  public static func reverseRsiLevels(_ closes: [Double], period: Int, targets: [Double] = defaultReverseRsiTargets) -> [ReverseRsiLevel] {
    let state = wilderRsiState(closes, period: period)
    return targets.map { t in ReverseRsiLevel(target: t, price: state.flatMap { reverseRsiPrice($0, period: period, target: t) }) }
  }
}
