import Foundation

/// Port of `bollinger-bands.ts` — Bollinger bands drawn on RSI (or MFI).
public enum BollingerBands {
  public struct Config: Sendable, Hashable {
    public var drawRSI = true
    public var drawMFI = false
    public var highlightBreaches = true
    public var length = 14
    public var source: VmcSource = .hlc3
    public var bbLength = 20
    public var multiplier = 2.0
    public init() {}
    public static let `default` = Config()
  }

  public struct Result: Sendable, Hashable {
    public var indicator: [TimePoint]
    public var basis: [TimePoint]
    public var upper: [TimePoint]
    public var lower: [TimePoint]
    public var overboughtBreaches: [TimePoint]
    public var oversoldBreaches: [TimePoint]
    public var isMfi: Bool
    public static let empty = Result(indicator: [], basis: [], upper: [], lower: [], overboughtBreaches: [], oversoldBreaches: [], isMfi: false)

    /// %B position of the latest indicator value within the bands (0 = lower, 1 = upper).
    public var percentB: Double? {
      guard let i = indicator.last?.value, let u = upper.last?.value, let l = lower.last?.value, u > l else { return nil }
      return (i - l) / (u - l)
    }
  }

  /// `DEFAULT_BB_COLORS`
  public enum Colors {
    public static let rsi: String = ChartColors.pastel[0]
    public static let mfi: String = ChartColors.pastel[1]
    public static let basis: String = ChartColors.pastel[2]
    public static let bands: String = ChartColors.pastel[3]
    public static let fillArea: String = ChartColors.addOpacity(ChartColors.pastel[3], 0.1)
    public static let overbought: String = ChartColors.pastel[4]
    public static let oversold: String = ChartColors.pastel[5]
  }

  static func mfi(_ data: [OHLCVBar], source: [Double], length: Int) -> [Double] {
    let volumes = data.map(\.volume)
    var upperSum = [Double](repeating: 0, count: data.count), lowerSum = upperSum
    for i in 0..<data.count {
      var up = 0.0, lo = 0.0
      for j in max(0, i - length + 1)...i {
        let change = j > 0 ? source[j] - source[j - 1] : 0
        if change >= 0 { up += volumes[j] * source[j] } else { lo += volumes[j] * source[j] }
      }
      upperSum[i] = up; lowerSum[i] = lo
    }
    var out = [Double](repeating: 50, count: data.count)
    for i in 0..<data.count {
      let u: Double = upperSum[i]
      let l: Double = lowerSum[i]
      let total: Double = u + l
      out[i] = total == 0 ? 50 : 100 * u / total
    }
    return out
  }

  public static func calculate(_ data: [OHLCVBar], config c: Config = .default) -> Result {
    guard !data.isEmpty else { return .empty }
    let times = data.map(\.time)
    let src = CandleSources(data).series(c.source)
    let useMfi = c.drawMFI
    let values = useMfi ? mfi(data, source: src, length: c.length) : TechnicalIndicators.rsi(src, c.length)
    let basis = TechnicalIndicators.sma(values, c.bbLength)
    let sd = TechnicalIndicators.stdev(values, c.bbLength)
    var upper = [Double](repeating: .nan, count: values.count), lower = upper
    for i in 0..<basis.count where basis[i].isFinite && sd[i].isFinite {
      upper[i] = basis[i] + c.multiplier * sd[i]
      lower[i] = basis[i] - c.multiplier * sd[i]
    }
    func series(_ v: [Double]) -> [TimePoint] {
      var out: [TimePoint] = []
      for i in 0..<min(times.count, v.count) where v[i].isFinite { out.append(TimePoint(epochSeconds: times[i], value: v[i])) }
      return out
    }
    var ob: [TimePoint] = [], os: [TimePoint] = []
    for i in 0..<values.count where values[i].isFinite {
      if upper[i].isFinite, values[i] > upper[i] { ob.append(TimePoint(epochSeconds: times[i], value: values[i])) }
      if lower[i].isFinite, values[i] < lower[i] { os.append(TimePoint(epochSeconds: times[i], value: values[i])) }
    }
    return Result(indicator: series(values), basis: series(basis), upper: series(upper), lower: series(lower), overboughtBreaches: ob, oversoldBreaches: os, isMfi: useMfi)
  }
}
