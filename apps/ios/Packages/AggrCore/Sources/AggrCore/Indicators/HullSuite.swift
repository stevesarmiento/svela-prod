import Foundation

/// Port of `hooks/use-hull-suite.ts` (Pine "Hull Suite by InSilico"). Uses its own lenient wma/ema variants
/// (sparse results in TS → NaN here for missing indices).
public enum HullSuite {
  public enum Mode: String, Sendable { case hma = "Hma", ehma = "Ehma", thma = "Thma" }
  public enum Source: String, Sendable { case close, high, low, open }

  public struct Config: Sendable, Hashable {
    public var source: Source = .close
    public var mode: Mode = .hma
    public var length: Int = 55
    public var lengthMult: Double = 1.0
    public init(source: Source = .close, mode: Mode = .hma, length: Int = 55, lengthMult: Double = 1.0) {
      self.source = source; self.mode = mode; self.length = length; self.lengthMult = lengthMult
    }
    /// The token page uses Ehma 55.
    public static let tokenPage = Config(source: .close, mode: .ehma, length: 55, lengthMult: 1.0)
  }

  public struct Result: Sendable, Hashable {
    public var mhull: [TimePoint]
    public var shull: [TimePoint]
    public var trendingUp: [Int]
    public var trendingDown: [Int]
    public init(mhull: [TimePoint], shull: [TimePoint], trendingUp: [Int], trendingDown: [Int]) {
      self.mhull = mhull; self.shull = shull; self.trendingUp = trendingUp; self.trendingDown = trendingDown
    }
    public static let empty = Result(mhull: [], shull: [], trendingUp: [], trendingDown: [])
  }

  static func wma(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: .nan, count: data.count)
    guard period >= 1 else { return result }
    var i = period - 1
    while i < data.count {
      var sum = 0.0, weightSum = 0.0
      for j in 0..<period { let v = data[i - j]; if v.isFinite { let w = Double(period - j); sum += v * w; weightSum += w } }
      result[i] = weightSum > 0 ? sum / weightSum : .nan
      i += 1
    }
    return result
  }

  static func ema(_ data: [Double], _ period: Int) -> [Double] {
    var result = [Double](repeating: .nan, count: data.count)
    guard !data.isEmpty, period >= 1 else { return result }
    let m = 2.0 / Double(period + 1)
    var first = 0
    while first < data.count && !data[first].isFinite { first += 1 }
    guard first < data.count else { return result }
    result[first] = data[first]
    var i = first + 1
    while i < data.count {
      let v = data[i], prev = result[i - 1]
      result[i] = (v.isFinite && prev.isFinite) ? v * m + prev * (1 - m) : prev
      i += 1
    }
    return result
  }

  static func combine(_ a: [Double], _ b: [Double], _ f: (Double, Double) -> Double) -> [Double] {
    zip(a, b).map { ($0.isFinite && $1.isFinite) ? f($0, $1) : .nan }
  }

  static func hma(_ data: [Double], _ length: Int) -> [Double] {
    let half = length / 2, sq = Int(Double(length).squareRoot().rounded())
    return wma(combine(wma(data, half), wma(data, length)) { 2 * $0 - $1 }, sq)
  }

  static func ehma(_ data: [Double], _ length: Int) -> [Double] {
    let half = length / 2, sq = Int(Double(length).squareRoot().rounded())
    return ema(combine(ema(data, half), ema(data, length)) { 2 * $0 - $1 }, sq)
  }

  static func thma(_ data: [Double], _ length: Int) -> [Double] {
    let w1 = wma(data, length / 3), w2 = wma(data, length / 2), w3 = wma(data, length)
    var diff = [Double](repeating: .nan, count: data.count)
    for i in 0..<data.count where w1[i].isFinite && w2[i].isFinite && w3[i].isFinite { diff[i] = w1[i] * 3 - w2[i] - w3[i] }
    return wma(diff, length)
  }

  static func mode(_ m: Mode, _ src: [Double], _ len: Int) -> [Double] {
    switch m {
    case .hma: hma(src, len)
    case .ehma: ehma(src, len)
    case .thma: thma(src, len / 2)
    }
  }

  public static func compute(_ bars: [OHLCVBar], config: Config = .tokenPage) -> Result {
    guard !bars.isEmpty else { return Result(mhull: [], shull: [], trendingUp: [], trendingDown: []) }
    let src: [Double] = bars.map {
      switch config.source { case .close: $0.close; case .high: $0.high; case .low: $0.low; case .open: $0.open }
    }
    let adjusted = Int((Double(config.length) * config.lengthMult).rounded(.down))
    guard adjusted >= 1 else { return Result(mhull: [], shull: [], trendingUp: [], trendingDown: []) }
    let hull = mode(config.mode, src, adjusted)
    var mhull: [TimePoint] = [], shull: [TimePoint] = [], up: [Int] = [], down: [Int] = []
    var i = 2
    while i < bars.count {
      let m = hull[i], s = hull[i - 2]
      if m.isFinite {
        mhull.append(TimePoint(epochSeconds: bars[i].time, value: m))
        if s.isFinite {
          shull.append(TimePoint(epochSeconds: bars[i].time, value: s))
          if i > 2 {
            let pm = hull[i - 1], ps = hull[i - 3]
            if pm.isFinite && ps.isFinite {
              if pm <= ps && m > s { up.append(bars[i].time) }
              if pm >= ps && m < s { down.append(bars[i].time) }
            }
          }
        }
      }
      i += 1
    }
    return Result(mhull: mhull, shull: shull, trendingUp: up, trendingDown: down)
  }
}
