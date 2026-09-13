import Foundation

/// Pure frame state, independent of UIKit and of the observation / network cadence.
public final class LivelineEngine {
  public private(set) var input: LivelineInput?
  public private(set) var splines: [String: LivelineSpline] = [:]
  public private(set) var alpha: [String: Double] = [:]
  public private(set) var xRange: ClosedRange<Double> = 0...1
  public private(set) var yRange: ClosedRange<Double> = 0...1
  public private(set) var reveal = 0.0
  public private(set) var scrubAmount = 0.0
  public private(set) var displayedValue = 0.0
  public private(set) var elapsed = 0.0
  public var configuration = LivelineConfiguration()
  public var selectedTime: Double? {
    didSet { if let selectedTime { lastInspectionTime = selectedTime } }
  }
  private var lastInspectionTime: Double?
  /// A released cursor stays at its last position until its exit animation finishes.
  public var inspectionTime: Double? { selectedTime ?? (scrubAmount > 0 ? lastInspectionTime : nil) }
  public private(set) var isAnimating = false
  private var historicalSplines: [String: LivelineSpline] = [:]
  private var targetY: ClosedRange<Double> = 0...1
  private var fromX: ClosedRange<Double> = 0...1
  private var toX: ClosedRange<Double> = 0...1
  private var transitionStart = 0.0
  private var clock: Double?
  private var firstFrame = true
  private var previousObservation: LivelineObservation?
  private var initialized = false
  private var revision = 0
  private struct RangeKey: Equatable {
    let revision: Int
    let x: ClosedRange<Double>
    let visible: [String]
    let profile: LivelineProfile
    let reference: Double?
    let exaggerate: Bool
  }
  private var rangeKey: RangeKey?
  private var cachedRange: ClosedRange<Double> = 0...1

  public init() {}

  public func update(_ newInput: LivelineInput, configuration: LivelineConfiguration, marketTime: Double) {
    let wasPaused = self.configuration.paused
    self.configuration = configuration
    if configuration.paused { return }
    let next = newInput
    guard next != input || wasPaused else { return }
    let newIdentity = input?.id != next.id
    let sameToken = input?.id.split(separator: "|").first == next.id.split(separator: "|").first
    var clean = next
    clean.series = next.series.map { s in var s = s; s.points = LivelineMath.clean(s.points); return s }
    clean.volume = LivelineMath.clean(next.volume).filter { $0.value >= 0 }
    if let observation = clean.observation {
      if !observation.value.isFinite || !observation.time.isFinite || observation.value <= 0 {
        clean.observation = nil
      } else if !newIdentity, let previousObservation, observation.time < previousObservation.time {
        clean.observation = previousObservation
      }
    }
    if newIdentity { clearInspection(); previousObservation = nil }
    if let observation = clean.observation,
       let last = clean.series.first(where: { $0.id == clean.primaryID })?.points.last,
       observation.time < last.time { clean.observation = nil }
    previousObservation = clean.observation
    input = clean
    revision += 1
    historicalSplines = Dictionary(uniqueKeysWithValues: clean.series.map { ($0.id, LivelineSpline($0.points)) })
    splines = historicalSplines
    let value = clean.observation?.value ?? historicalSplines[clean.primaryID]?.points.last?.value ?? 0
    if !initialized || !sameToken { displayedValue = value; reveal = 0; alpha = [:] }
    updateDisplayedEndpoint()
    let target = viewport(marketTime: marketTime)
    if !initialized || !sameToken { xRange = target; fromX = target; toX = target }
    else if target != toX { fromX = xRange; toX = target; transitionStart = elapsed }
    if !initialized || !sameToken { targetY = computeRange(); yRange = targetY }
    initialized = true
    isAnimating = true
  }

  public func resetClock() { clock = nil }

  public func clearInspection() {
    selectedTime = nil; lastInspectionTime = nil; scrubAmount = 0
  }

  private func updateDisplayedEndpoint() {
    guard let input, var points = historicalSplines[input.primaryID]?.points, let last = points.last else { return }
    let time = input.observation?.time ?? last.time
    let endpoint = LivelinePoint(time: time, value: displayedValue)
    guard splines[input.primaryID]?.points.last != endpoint else { return }
    // Animate a rendering copy for both history refreshes and live observations.
    // Keep the supplied history and its timestamps intact for calculations/accessibility.
    if time > last.time { points.append(endpoint) }
    else { points[points.count - 1] = endpoint }
    splines[input.primaryID] = LivelineSpline(points)
    revision += 1
  }

  @discardableResult
  public func advance(monotonicTime: Double, marketTime: Double) -> Bool {
    let dt = clock.map { min(50, max(0, (monotonicTime - $0) * 1000)) } ?? 16.67
    clock = monotonicTime
    guard let input else { isAnimating = false; return false }
    guard !configuration.paused else { isAnimating = false; return false }
    elapsed += dt
    let noMotion = configuration.reduceMotion
    let value = input.observation?.value ?? historicalSplines[input.primaryID]?.points.last?.value ?? 0
    let gap = min(abs(value - displayedValue) / max(yRange.upperBound - yRange.lowerBound, 1e-15), 1)
    let speed = noMotion ? 1 : configuration.lerpSpeed + (1 - gap) * 0.2
    displayedValue = LivelineMath.lerp(displayedValue, value, speed: speed, milliseconds: dt)
    if abs(value - displayedValue) < max(abs(value), 1e-10) * 1e-9 { displayedValue = value }
    updateDisplayedEndpoint()
    if case .liveWindow = input.viewport { toX = viewport(marketTime: marketTime) }
    let t = noMotion ? 1 : min(1, max(0, (elapsed - transitionStart) / 750))
    if t >= 1 { xRange = toX }
    else {
      let eased = (1 - cos(t * .pi)) / 2
      let span = exp(log(max(fromX.upperBound - fromX.lowerBound, 1e-6)) * (1 - eased)
        + log(max(toX.upperBound - toX.lowerBound, 1e-6)) * eased)
      let end = fromX.upperBound + (toX.upperBound - fromX.upperBound) * eased
      xRange = (end - span)...end
    }
    for s in input.series {
      let target = s.visible ? 1.0 : 0
      let current = alpha[s.id] ?? target
      let next = LivelineMath.lerp(current, target, speed: noMotion ? 1 : 0.10, milliseconds: dt)
      alpha[s.id] = abs(next - target) < 0.001 ? target : next
    }
    targetY = computeRange()
    let lo = LivelineMath.lerp(yRange.lowerBound, targetY.lowerBound, speed: noMotion ? 1 : 0.15, milliseconds: dt)
    let hi = LivelineMath.lerp(yRange.upperBound, targetY.upperBound, speed: noMotion ? 1 : 0.15, milliseconds: dt)
    yRange = min(lo, hi)...max(lo, hi)
    let hasData = input.state == .ready && (historicalSplines[input.primaryID]?.points.count ?? 0) >= 2
    let revealTarget = hasData ? 1.0 : 0
    reveal = LivelineMath.lerp(reveal, revealTarget, speed: noMotion ? 1 : hasData ? 0.09 : 0.14, milliseconds: dt)
    if abs(reveal - revealTarget) < 0.001 { reveal = revealTarget }
    let scrubTarget = selectedTime == nil ? 0.0 : 1
    scrubAmount = LivelineMath.lerp(scrubAmount, scrubTarget, speed: noMotion ? 1 : 0.12, milliseconds: dt)
    if abs(scrubAmount - scrubTarget) < 0.01 { scrubAmount = scrubTarget }
    if scrubAmount == 0 && selectedTime == nil { lastInspectionTime = nil }
    let span = max(targetY.upperBound - targetY.lowerBound, 1e-15)
    let rangeMoving = abs(lo - targetY.lowerBound) + abs(hi - targetY.upperBound) > span * 1e-5
    let alphaMoving = input.series.contains { abs((alpha[$0.id] ?? 1) - ($0.visible ? 1 : 0)) > 0.001 }
    let liveWindow: Bool = { if case .liveWindow = input.viewport { return true }; return false }()
    isAnimating = firstFrame || t < 1 || rangeMoving || alphaMoving || displayedValue != value
      || reveal != revealTarget || scrubAmount != scrubTarget
      || (!noMotion && ((configuration.pulse && input.observation != nil) || input.state == .loading || liveWindow))
    firstFrame = false
    return isAnimating
  }

  public func selection(at time: Double) -> LivelineSelection? {
    guard let input, input.state == .ready else { return nil }
    let last = splines[input.primaryID]?.points.last?.time ?? 0
    let isProjection = time > last && input.projectionID != nil
    let chosenID = isProjection ? input.projectionID! : input.primaryID
    guard let value = splines[chosenID]?.value(at: time, clamp: !isProjection) else { return nil }
    let values = splines.compactMapValues { $0.value(at: time, clamp: false) }
    return .init(time: time, value: value, values: values, isProjection: isProjection,
                 nearestObservation: historicalSplines[input.primaryID]?.nearest(at: time))
  }

  private func viewport(marketTime: Double) -> ClosedRange<Double> {
    guard let input else { return 0...1 }
    switch input.viewport {
    case .historical(let range):
      let end = max(range.upperBound, input.observation?.time ?? range.upperBound)
      return range.lowerBound...max(end, range.lowerBound + 1)
    case .liveWindow(let duration):
      let span = max(1, duration), end = marketTime + max(1, duration) * (configuration.badge ? 0.05 : 0.015)
      return (end - span)...end
    }
  }

  private func computeRange() -> ClosedRange<Double> {
    guard let input else { return 0...1 }
    let visible = input.series.filter { (alpha[$0.id] ?? ($0.visible ? 1 : 0)) > 0.01 }
    let key = RangeKey(revision: revision, x: xRange, visible: visible.map(\.id),
                       profile: configuration.profile, reference: configuration.referenceValue, exaggerate: configuration.exaggerate)
    if key == rangeKey { return cachedRange }
    var minimum = Double.infinity, maximum = -Double.infinity
    func include(_ value: Double) {
      guard value.isFinite else { return }
      minimum = min(minimum, value); maximum = max(maximum, value)
    }
    for series in visible {
      if let spline = splines[series.id] {
        for point in spline.points where xRange.contains(point.time) { include(point.value * series.multiplier) }
        if let v = spline.value(at: xRange.lowerBound, clamp: false) { include(v * series.multiplier) }
        if let v = spline.value(at: xRange.upperBound, clamp: false) { include(v * series.multiplier) }
      }
    }
    if let reference = configuration.referenceValue { include(reference) }
    cachedRange = LivelineMath.range(minimum.isFinite ? [minimum, maximum] : [], profile: configuration.profile, exaggerate: configuration.exaggerate)
    rangeKey = key
    return cachedRange
  }
}
