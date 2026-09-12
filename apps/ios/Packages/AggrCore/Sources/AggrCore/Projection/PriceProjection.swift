import Foundation

/// Port of `lib/price-projection.ts`: geometric (log-space) drift + ±1σ·√t cone anchored at the last close.
public enum PriceProjection {
  public struct InputPoint: Sendable, Hashable {
    public var timeEpochSec: Int
    public var close: Double
    public init(timeEpochSec: Int, close: Double) { self.timeEpochSec = timeEpochSec; self.close = close }
  }

  public struct Modifiers: Sendable, Hashable {
    public var smootherSlopePerBar: Double?
    public var volRegimePercentile: Double?
    public var sentimentTilt: Double?
    public init(smootherSlopePerBar: Double? = nil, volRegimePercentile: Double? = nil, sentimentTilt: Double? = nil) {
      self.smootherSlopePerBar = smootherSlopePerBar; self.volRegimePercentile = volRegimePercentile; self.sentimentTilt = sentimentTilt
    }
  }

  public struct Meta: Sendable, Hashable {
    public var horizonBars: Int
    public var lookbackBars: Int
    public var muPerBar: Double
    public var sigmaPerBar: Double
    public var intervalSec: Double
    public var muOlsPerBar: Double
    public var smootherSlopePerBar: Double?
    public var volRegimePercentile: Double?
    public var sentimentTilt: Double?
    public var volScale: Double
    public var bullMult: Double
    public var bearMult: Double
  }

  public struct Result: Sendable, Hashable {
    public var base: [TimePoint]
    public var bull: [TimePoint]
    public var bear: [TimePoint]
    public var meta: Meta
  }

  public static let minProjectionBars = 30
  static let minLogReturns = 10
  static let horizonRatio = 0.25
  static let minHorizonBars = 8
  static let maxHorizonBars = 90
  static let maxAbsTotalDrift = log(3.0)
  static let maxSigmaPerBar = 0.35
  static let maxConeHalfWidth = log(4.0)
  static let maxTiltSkew = 0.2

  static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { max(lo, min(hi, v)) }

  /// Full-window OLS over y indexed by x = 0..n-1.
  public static func olsSlope(_ values: [Double]) -> (slope: Double, intercept: Double)? {
    let n = values.count
    guard n >= 2 else { return nil }
    let nd = Double(n)
    let sumX = nd * (nd - 1) / 2
    let sumX2 = (nd - 1) * nd * (2 * nd - 1) / 6
    var sumY = 0.0, sumXY = 0.0
    for (i, y) in values.enumerated() { sumY += y; sumXY += Double(i) * y }
    let denom = nd * sumX2 - sumX * sumX
    guard denom != 0 else { return nil }
    let slope = (nd * sumXY - sumX * sumY) / denom
    let intercept = (sumY - slope * sumX) / nd
    guard slope.isFinite, intercept.isFinite else { return nil }
    return (slope, intercept)
  }

  static func median(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    let s = values.sorted()
    let mid = s.count / 2
    return s.count % 2 == 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  }

  public static func compute(_ points: [InputPoint], modifiers: Modifiers = Modifiers()) -> Result? {
    var clean: [InputPoint] = []
    clean.reserveCapacity(points.count)
    for p in points {
      guard p.close.isFinite, p.close > 0 else { continue }
      if let prev = clean.last, p.timeEpochSec <= prev.timeEpochSec { continue }
      clean.append(p)
    }
    let n = clean.count
    guard n >= minProjectionBars else { return nil }

    let horizonBars = Int(clamp((Double(n) * horizonRatio).rounded(), Double(minHorizonBars), Double(maxHorizonBars)))
    let lookbackBars = Int(clamp(Double(2 * horizonBars), 20, Double(n - 1)))
    let window = Array(clean[(n - (lookbackBars + 1))...])
    let logCloses = window.map { log($0.close) }

    guard let fit = olsSlope(logCloses) else { return nil }
    let muOls = fit.slope
    let smoother = modifiers.smootherSlopePerBar.flatMap { $0.isFinite ? $0 : nil }
    var mu = smoother.map { 0.5 * muOls + 0.5 * $0 } ?? muOls

    var logReturns: [Double] = []
    for i in 1..<logCloses.count { let r = logCloses[i] - logCloses[i - 1]; if r.isFinite { logReturns.append(r) } }
    guard logReturns.count >= minLogReturns else { return nil }
    let mean = logReturns.reduce(0, +) / Double(logReturns.count)
    let variance = logReturns.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(logReturns.count)
    var sigma = variance.squareRoot()

    let volPct = modifiers.volRegimePercentile.flatMap { $0.isFinite ? clamp($0, 0, 100) : nil }
    let volScale = volPct.map { 1.25 - 0.5 * ($0 / 100) } ?? 1
    sigma *= volScale

    let tilt = modifiers.sentimentTilt.flatMap { $0.isFinite ? clamp($0, -1, 1) : nil }
    let bullMult = 1 + maxTiltSkew * (tilt ?? 0)
    let bearMult = 1 - maxTiltSkew * (tilt ?? 0)

    let totalDrift = mu * Double(horizonBars)
    if abs(totalDrift) > maxAbsTotalDrift { mu = (totalDrift < 0 ? -1 : 1) * maxAbsTotalDrift / Double(horizonBars) }
    sigma = min(sigma, maxSigmaPerBar)
    let wider = max(bullMult, bearMult)
    let halfWidth = wider * sigma * Double(horizonBars).squareRoot()
    if halfWidth > maxConeHalfWidth { sigma = maxConeHalfWidth / (wider * Double(horizonBars).squareRoot()) }

    var deltas: [Double] = []
    var i = max(1, n - lookbackBars)
    while i < n { deltas.append(Double(clean[i].timeEpochSec - clean[i - 1].timeEpochSec)); i += 1 }
    guard let intervalSec = median(deltas), intervalSec.isFinite, intervalSec > 0 else { return nil }

    let anchor = clean[n - 1]
    let t0 = Double(anchor.timeEpochSec), p0 = anchor.close
    var base: [TimePoint] = [], bull: [TimePoint] = [], bear: [TimePoint] = []
    let sqrtH = Double(horizonBars).squareRoot()
    for k in 0...horizonBars {
      let t = Int((t0 + Double(k) * intervalSec).rounded())
      let drift = mu * Double(k)
      let spread = sigma * (Double(k) / sqrtH)
      base.append(TimePoint(epochSeconds: t, value: p0 * exp(drift)))
      bull.append(TimePoint(epochSeconds: t, value: p0 * exp(drift + bullMult * spread)))
      bear.append(TimePoint(epochSeconds: t, value: p0 * exp(drift - bearMult * spread)))
    }
    return Result(base: base, bull: bull, bear: bear, meta: Meta(
      horizonBars: horizonBars, lookbackBars: lookbackBars, muPerBar: mu, sigmaPerBar: sigma, intervalSec: intervalSec,
      muOlsPerBar: muOls, smootherSlopePerBar: smoother, volRegimePercentile: volPct, sentimentTilt: tilt,
      volScale: volScale, bullMult: bullMult, bearMult: bearMult))
  }

  // MARK: Modifier inputs (`hooks/use-price-projection.ts`)

  static let smootherSlopeWindow = 20
  public static let divergenceRecencyRatio = 0.25

  /// Hull MA slope (log-space, per bar) over its most recent 20 bars; nil when < 10 usable points.
  public static func smootherSlopePerBar(_ smootherLine: [TimePoint]) -> Double? {
    guard smootherLine.count >= 10 else { return nil }
    let logs = smootherLine.suffix(smootherSlopeWindow).compactMap { $0.value.isFinite && $0.value > 0 ? log($0.value) : nil }
    guard logs.count >= 10 else { return nil }
    return olsSlope(logs)?.slope
  }
}
