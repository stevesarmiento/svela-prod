import Foundation

/// Pure frame state, independent of UIKit and of the observation / network cadence.
public final class LivelineEngine {
  /// The normalized (cleaned) input the engine renders from.
  public private(set) var input: LivelineInput?
  /// Rendering splines. The primary's last point is the animated endpoint; every other point and
  /// every other series is identical to `historicalSplines`.
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
  /// Bumped only when series/volume data changes, never for endpoint or observation moves.
  /// Renderers key their geometry caches on it.
  public private(set) var revision = 0
  /// Whether the primary rendering spline carries an extra appended point for a live observation
  /// newer than the history (as opposed to animating the history's last point in place).
  public private(set) var endpointAppended = false
  private var historicalSplines: [String: LivelineSpline] = [:]
  /// The last raw (un-normalized) input accepted, so hosts re-sending an observation that
  /// normalization drops still compare equal.
  private var rawInput: LivelineInput?
  private var targetY: ClosedRange<Double> = 0...1
  private var fromX: ClosedRange<Double> = 0...1
  private var toX: ClosedRange<Double> = 0...1
  private var transitionStart = 0.0
  private var clock: Double?
  private var firstFrame = true
  private var previousObservation: LivelineObservation?
  private var initialized = false
  #if DEBUG
  private(set) var splineBuildCount = 0
  private(set) var rangeScanCount = 0
  var debugTargetY: ClosedRange<Double> { targetY }
  #endif
  private struct RangeKey: Equatable {
    let revision: Int
    let x: ClosedRange<Double>
    let visible: [String]
    let profile: LivelineProfile
    let reference: Double?
    let exaggerate: Bool
    let endpointAppended: Bool
    let primaryCount: Int
  }
  private var rangeKey: RangeKey?
  /// Extent of every visible point inside `xRange` except the primary's animated endpoint.
  private var baseExtent: (min: Double, max: Double) = (.infinity, -.infinity)
  private var cachedEndpoint: LivelinePoint?
  private var cachedRange: ClosedRange<Double> = 0...1
  private struct SelectionKey: Equatable {
    let time: Double, revision: Int, endpoint: LivelinePoint?, state: LivelineDataState
    let primary: String, projection: String?
  }
  private var selectionKey: SelectionKey?
  private var cachedSelection: LivelineSelection?

  public init() {}

  /// Applies a new snapshot. Returns what kind of change was applied so hosts can skip work
  /// (accessibility, compositor layers) that only matters for `.data`.
  @discardableResult
  public func update(_ newInput: LivelineInput, configuration: LivelineConfiguration, marketTime: Double) -> LivelineInput.Change {
    let wasPaused = self.configuration.paused
    self.configuration = configuration
    if configuration.paused { return .none }
    let change: LivelineInput.Change = wasPaused ? .data : rawInput.map { newInput.change(from: $0) } ?? .data
    switch change {
    case .none:
      return .none
    case .emphasis:
      // Focusing comparison lines changes only emphasis. Preserve the splines,
      // animated endpoint, and cached range while the opacity interpolates.
      rawInput = newInput
      for index in input!.series.indices { input!.series[index].opacity = newInput.series[index].opacity }
      isAnimating = true
      return .emphasis
    case .observation:
      rawInput = newInput
      input!.observation = normalizedObservation(newInput.observation, newIdentity: false, cleaned: input!)
      previousObservation = input!.observation
      finishUpdate(marketTime: marketTime, newIdentity: false, sameToken: true, primaryChanged: false)
      return .observation
    case .data:
      break
    }
    let next = newInput
    let newIdentity = input?.id != next.id
    let primaryChanged = input?.primaryID != next.primaryID
    let sameToken = input?.id.split(separator: "|").first == next.id.split(separator: "|").first
    var clean = next
    clean.series = next.series.map { s in var s = s; s.points = LivelineMath.clean(s.points); return s }
    clean.volume = LivelineMath.clean(next.volume).filter { $0.value >= 0 }
    if newIdentity { clearInspection(); previousObservation = nil }
    clean.observation = normalizedObservation(clean.observation, newIdentity: newIdentity, cleaned: clean)
    previousObservation = clean.observation
    rawInput = next
    input = clean
    revision += 1
    historicalSplines = Dictionary(uniqueKeysWithValues: clean.series.map { ($0.id, LivelineSpline($0.points)) })
    #if DEBUG
    splineBuildCount += clean.series.count
    #endif
    splines = historicalSplines
    endpointAppended = false
    let value = clean.observation?.value ?? historicalSplines[clean.primaryID]?.points.last?.value ?? 0
    if !initialized || !sameToken { displayedValue = value; reveal = 0; alpha = [:] }
    else if primaryChanged { displayedValue = value }
    finishUpdate(marketTime: marketTime, newIdentity: newIdentity, sameToken: sameToken, primaryChanged: primaryChanged)
    return .data
  }

  private func normalizedObservation(_ observation: LivelineObservation?, newIdentity: Bool, cleaned: LivelineInput) -> LivelineObservation? {
    guard var observation else { return nil }
    if !observation.value.isFinite || !observation.time.isFinite || observation.value <= 0 { return nil }
    if !newIdentity, let previousObservation, observation.time < previousObservation.time { observation = previousObservation }
    if let last = cleaned.series.first(where: { $0.id == cleaned.primaryID })?.points.last, observation.time < last.time { return nil }
    return observation
  }

  private func finishUpdate(marketTime: Double, newIdentity: Bool, sameToken: Bool, primaryChanged: Bool) {
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

  /// Moves the primary rendering spline's endpoint to `displayedValue` without rebuilding it:
  /// a point replacement/append patches three tangents and keeps the history immutable.
  private func updateDisplayedEndpoint() {
    guard let input, let history = historicalSplines[input.primaryID], let last = history.points.last else { return }
    let time = input.observation?.time ?? last.time
    let endpoint = LivelinePoint(time: time, value: displayedValue)
    guard splines[input.primaryID]?.points.last != endpoint else { return }
    // Animate a rendering copy for both history refreshes and live observations.
    // Keep the supplied history and its timestamps intact for calculations/accessibility.
    let appends = time > last.time
    if appends != endpointAppended { splines[input.primaryID] = history; endpointAppended = false }
    // Removing before mutating keeps the point buffer uniquely referenced, so the patch is in place.
    var spline = splines.removeValue(forKey: input.primaryID) ?? history
    if appends && !endpointAppended { spline.append(endpoint); endpointAppended = true }
    else { spline.replaceLast(endpoint) }
    splines[input.primaryID] = spline
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
    if t >= 1 || fromX == toX { xRange = toX }
    else {
      let eased = (1 - cos(t * .pi)) / 2
      let span = exp(log(max(fromX.upperBound - fromX.lowerBound, 1e-6)) * (1 - eased)
        + log(max(toX.upperBound - toX.lowerBound, 1e-6)) * eased)
      let end = fromX.upperBound + (toX.upperBound - fromX.upperBound) * eased
      xRange = (end - span)...end
    }
    for s in input.series {
      let target = s.targetOpacity
      let current = alpha[s.id] ?? target
      let emphasisSpeed = configuration.seriesLabels.isEmpty ? 0.10 : 0.40
      let next = LivelineMath.lerp(current, target, speed: noMotion ? 1 : emphasisSpeed, milliseconds: dt)
      alpha[s.id] = abs(next - target) < 0.001 ? target : next
    }
    targetY = computeRange()
    let lo = LivelineMath.lerp(yRange.lowerBound, targetY.lowerBound, speed: noMotion ? 1 : 0.15, milliseconds: dt)
    let hi = LivelineMath.lerp(yRange.upperBound, targetY.upperBound, speed: noMotion ? 1 : 0.15, milliseconds: dt)
    yRange = min(lo, hi)...max(lo, hi)
    let hasData = input.state == .ready && (historicalSplines[input.primaryID]?.points.count ?? 0) >= 2
    let revealTarget = hasData ? 1.0 : 0
    // Decorative (compact) charts skip the reveal morph; they appear settled on their first frame.
    let instantReveal = noMotion || configuration.compact
    reveal = LivelineMath.lerp(reveal, revealTarget, speed: instantReveal ? 1 : hasData ? 0.09 : 0.14, milliseconds: dt)
    if abs(reveal - revealTarget) < 0.001 { reveal = revealTarget }
    let scrubTarget = selectedTime == nil ? 0.0 : 1
    scrubAmount = LivelineMath.lerp(scrubAmount, scrubTarget, speed: noMotion ? 1 : 0.12, milliseconds: dt)
    if abs(scrubAmount - scrubTarget) < 0.01 { scrubAmount = scrubTarget }
    if scrubAmount == 0 && selectedTime == nil { lastInspectionTime = nil }
    let span = max(targetY.upperBound - targetY.lowerBound, 1e-15)
    let rangeMoving = abs(lo - targetY.lowerBound) + abs(hi - targetY.upperBound) > span * 1e-5
    if !rangeMoving { yRange = targetY }
    let alphaMoving = input.series.contains { abs((alpha[$0.id] ?? 1) - $0.targetOpacity) > 0.001 }
    let liveWindow: Bool = { if case .liveWindow = input.viewport { return true }; return false }()
    // The pulse ring lives on a CAShapeLayer the render server animates, so a settled
    // live chart no longer needs display-link frames just to keep it breathing.
    isAnimating = firstFrame || (fromX != toX && t < 1) || rangeMoving || alphaMoving || displayedValue != value
      || reveal != revealTarget || scrubAmount != scrubTarget
      || (!noMotion && (input.state == .loading || liveWindow))
    firstFrame = false
    return isAnimating
  }

  /// Memoized per (time, data, endpoint): the view publishes and the renderer draws the same
  /// selection every frame, so the second call is free.
  public func selection(at time: Double) -> LivelineSelection? {
    guard let input, input.state == .ready else { return nil }
    let key = SelectionKey(time: time, revision: revision, endpoint: splines[input.primaryID]?.points.last,
                           state: input.state, primary: input.primaryID, projection: input.projectionID)
    if key == selectionKey { return cachedSelection }
    let last = splines[input.primaryID]?.points.last?.time ?? 0
    let isProjection = time > last && input.projectionID != nil
    let chosenID = isProjection ? input.projectionID! : input.primaryID
    guard let value = splines[chosenID]?.value(at: time, clamp: !isProjection) else {
      selectionKey = key; cachedSelection = nil; return nil
    }
    let values = splines.compactMapValues { $0.value(at: time, clamp: false) }
    let selection = LivelineSelection(time: time, value: value, values: values, isProjection: isProjection,
                                      nearestObservation: historicalSplines[input.primaryID]?.nearest(at: time))
    selectionKey = key; cachedSelection = selection
    return selection
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

  /// The visible range. A full scan happens only when data, viewport, or visibility changes; the
  /// animated endpoint is folded in afterwards in O(series).
  private func computeRange() -> ClosedRange<Double> {
    guard let input else { return 0...1 }
    let visible = input.series.filter { (alpha[$0.id] ?? $0.targetOpacity) > 0.01 }
    let primary = splines[input.primaryID]
    let endpoint = primary?.points.last
    let key = RangeKey(revision: revision, x: xRange, visible: visible.map(\.id),
                       profile: configuration.profile, reference: configuration.referenceValue,
                       exaggerate: configuration.exaggerate, endpointAppended: endpointAppended,
                       primaryCount: primary?.points.count ?? 0)
    if key == rangeKey {
      if endpoint == cachedEndpoint { return cachedRange }
    } else {
      #if DEBUG
      rangeScanCount += 1
      #endif
      var minimum = Double.infinity, maximum = -Double.infinity
      for series in visible {
        guard let spline = splines[series.id] else { continue }
        let count = spline.points.count
        // The primary's animated endpoint is folded in below; an empty series has nothing to exclude.
        let excluded = series.id == input.primaryID ? max(0, count - 1) : count
        for index in 0..<excluded where xRange.contains(spline.points[index].time) {
          let value = spline.points[index].value * series.multiplier
          guard value.isFinite else { continue }
          minimum = min(minimum, value); maximum = max(maximum, value)
        }
      }
      baseExtent = (minimum, maximum)
      rangeKey = key
    }
    var minimum = baseExtent.min, maximum = baseExtent.max
    func include(_ value: Double) {
      guard value.isFinite else { return }
      minimum = min(minimum, value); maximum = max(maximum, value)
    }
    for series in visible {
      guard let spline = splines[series.id] else { continue }
      if series.id == input.primaryID, let endpoint, xRange.contains(endpoint.time) { include(endpoint.value * series.multiplier) }
      if let v = spline.value(at: xRange.lowerBound, clamp: false) { include(v * series.multiplier) }
      if let v = spline.value(at: xRange.upperBound, clamp: false) { include(v * series.multiplier) }
    }
    if let reference = configuration.referenceValue { include(reference) }
    cachedRange = LivelineMath.range(minimum.isFinite ? [minimum, maximum] : [], profile: configuration.profile, exaggerate: configuration.exaggerate)
    cachedEndpoint = endpoint
    return cachedRange
  }
}
