import Foundation

/// Port of `rsi-divergences.ts`.
public enum RsiDivergences {
  public struct Config: Sendable, Hashable {
    public var rsiLength = 14
    public var leftBars = 5, rightBars = 5
    public var pairMode: PairMode = .tvLike
    public var tolBars = 2
    public var priceMode: PriceMode = .highLow
    public var allowEqual = true
    public var priceEps = 0.0, rsiEps = 0.0
    public var showRegular = true, showHidden = true
    public var signalPeriod = 12
    public var signalType: SignalType = .ema
    public var alertHigh = 85.0, alertLow = 15.0
    public var reverseTargets: [Double] = TechnicalIndicators.defaultReverseRsiTargets
    public init() {}
    public static let `default` = Config()
  }
  public enum PriceMode: String, Sendable, Codable { case highLow = "High/Low", close = "Close" }
  public enum SignalType: String, Sendable, Codable { case ema = "EMA", sma = "SMA" }

  public struct Divergence: Sendable, Hashable {
    public var type: DivergenceType
    public var startIndex: Int, endIndex: Int
    public var startTime: Int, endTime: Int
    public var rsiStart: Double, rsiEnd: Double, priceStart: Double, priceEnd: Double
  }

  public struct Pivot: Sendable, Hashable { public var index: Int; public var time: Int; public var value: Double; public var isHigh: Bool }

  public static let zoneLevels = (critBull: 80.0, contBull: 62.0, middle: 50.0, contBear: 38.0, critBear: 20.0)

  public struct Result: Sendable, Hashable {
    public var rsiSeries: [TimePoint]
    public var signalSeries: [TimePoint]
    public var signalCurrent: Double?
    public var reverseSignalCross: Double?
    public var pivots: [Pivot]
    public var alertHigh: Double, alertLow: Double, alertHighOn: Bool, alertLowOn: Bool
    public var divergences: [Divergence]
    public var reverseLevels: [TechnicalIndicators.ReverseRsiLevel]
    public var latestRsi: Double? { rsiSeries.last?.value }
  }

  static func buildSignal(_ rsi: [Double], _ times: [Int], rsiLength: Int, period: Int, type: SignalType) -> [TimePoint] {
    guard rsi.count > rsiLength else { return [] }
    let valid = Array(rsi[rsiLength...])
    let smoothed = type == .sma ? TechnicalIndicators.sma(valid, period) : TechnicalIndicators.ema(valid, period)
    let offset = type == .sma ? period - 1 : 0
    var out: [TimePoint] = []
    var i = offset
    while i < smoothed.count {
      if smoothed[i].isFinite, rsiLength + i < times.count { out.append(TimePoint(epochSeconds: times[rsiLength + i], value: smoothed[i])) }
      i += 1
    }
    return out
  }

  static func signalCrossTarget(_ rsi: [Double], rsiLength: Int, period: Int, type: SignalType, current: Double?) -> Double? {
    if type == .ema { return current }
    guard period >= 2, rsi.count > rsiLength else { return nil }
    let valid = Array(rsi[rsiLength...])
    guard valid.count >= period - 1 else { return nil }
    let window = valid.suffix(period - 1)
    return window.reduce(0, +) / Double(window.count)
  }

  public static func calculate(_ data: [OHLCVBar], config c: Config = .default) -> Result {
    guard !data.isEmpty else {
      return Result(rsiSeries: [], signalSeries: [], signalCurrent: nil, reverseSignalCross: nil, pivots: [], alertHigh: c.alertHigh, alertLow: c.alertLow, alertHighOn: false, alertLowOn: false, divergences: [], reverseLevels: [])
    }
    let times = data.map(\.time), closes = data.map(\.close)
    let highs = data.map { c.priceMode == .highLow ? $0.high : $0.close }
    let lows = data.map { c.priceMode == .highLow ? $0.low : $0.close }
    let rsi = TechnicalIndicators.rsi(closes, c.rsiLength)
    let rsiSeries = zip(times, rsi).map { TimePoint(epochSeconds: $0, value: $1) }
    let paired = DivergenceEngine.findPairedDivergences(highs: highs, lows: lows, osc: rsi, config: .init(leftBars: c.leftBars, rightBars: c.rightBars, pairMode: c.pairMode, tolBars: c.tolBars, allowEqual: c.allowEqual, priceEps: c.priceEps, oscEps: c.rsiEps, showRegular: c.showRegular, showHidden: c.showHidden))
    let divergences = paired.map { Divergence(type: $0.type, startIndex: $0.startIndex, endIndex: $0.endIndex, startTime: times[$0.startIndex], endTime: times[$0.endIndex], rsiStart: $0.oscStart, rsiEnd: $0.oscEnd, priceStart: $0.priceStart, priceEnd: $0.priceEnd) }
    let signal = buildSignal(rsi, times, rsiLength: c.rsiLength, period: c.signalPeriod, type: c.signalType)
    let signalCurrent = signal.last?.value
    let crossTarget = signalCrossTarget(rsi, rsiLength: c.rsiLength, period: c.signalPeriod, type: c.signalType, current: signalCurrent)
    let crossState = crossTarget == nil ? nil : TechnicalIndicators.wilderRsiState(closes, period: c.rsiLength)
    let reverseCross = (crossState != nil && crossTarget != nil) ? TechnicalIndicators.reverseRsiPrice(crossState!, period: c.rsiLength, target: crossTarget!) : nil
    let lastRsi: Double? = closes.count > c.rsiLength ? rsi.last : nil
    var pivots: [Pivot] = []
    for i in 0..<rsi.count {
      if let h = DivergenceEngine.pivotHighAt(rsi, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i) { pivots.append(Pivot(index: i - c.rightBars, time: times[i - c.rightBars], value: h, isHigh: true)) }
      if let l = DivergenceEngine.pivotLowAt(rsi, leftBars: c.leftBars, rightBars: c.rightBars, currentIndex: i) { pivots.append(Pivot(index: i - c.rightBars, time: times[i - c.rightBars], value: l, isHigh: false)) }
    }
    return Result(rsiSeries: rsiSeries, signalSeries: signal, signalCurrent: signalCurrent, reverseSignalCross: reverseCross, pivots: pivots,
                  alertHigh: c.alertHigh, alertLow: c.alertLow, alertHighOn: (lastRsi ?? -1) >= c.alertHigh, alertLowOn: lastRsi != nil && lastRsi! <= c.alertLow,
                  divergences: divergences, reverseLevels: TechnicalIndicators.reverseRsiLevels(closes, period: c.rsiLength, targets: c.reverseTargets))
  }
}
