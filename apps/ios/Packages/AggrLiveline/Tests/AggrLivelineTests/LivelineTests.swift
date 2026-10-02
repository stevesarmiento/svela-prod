import Foundation
import Testing
@testable import AggrLiveline

private struct Golden: Decodable {
  struct Curve: Decodable {
    let points: [[Double]], segments: [[Double]], samples: [LivelinePoint]
    let range: Bounds
    let momentum: String
  }
  struct Bounds: Decodable { let min: Double, max: Double }
  struct Schedule: Decodable { let hz: Int, value: Double }
  struct Interval: Decodable { let window: Double, value: Double }
  struct Loading: Decodable { let t: Double, value: Double }
  let curves: [Curve], schedules: [Schedule], intervals: [Interval], loading: [Loading]
  static func load() throws -> Golden {
    try JSONDecoder().decode(Self.self, from: Data(contentsOf: Bundle.module.url(forResource: "upstream", withExtension: "json")!))
  }
}
private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) <= max(abs(a), abs(b), 1e-12) * 1e-8 }

@Test func splineMatchesPinnedUpstreamBezierGeometryAndSamples() throws {
  for curve in try Golden.load().curves {
    let pts = curve.points.map { LivelinePoint(time: $0[0], value: $0[1]) }
    let spline = LivelineSpline(pts)
    for (i, segment) in curve.segments.enumerated() {
      let a = pts[i], b = pts[i + 1], h = b.time - a.time
      let actual = [a.time + h / 3, a.value + spline.tangents[i] * h / 3,
                    b.time - h / 3, b.value - spline.tangents[i + 1] * h / 3, b.time, b.value]
      for (a, b) in zip(actual, segment) { #expect(close(a, b)) }
    }
    for sample in curve.samples { #expect(close(spline.value(at: sample.time)!, sample.value)) }
  }
}

@Test func mathMatchesUpstreamRangesMomentumTimingAndLoading() throws {
  let golden = try Golden.load()
  for curve in golden.curves {
    let pts = curve.points.map { LivelinePoint(time: $0[0], value: $0[1]) }
    let range = LivelineMath.range(pts.map(\.value), profile: .reference)
    #expect(close(range.lowerBound, curve.range.min)); #expect(close(range.upperBound, curve.range.max))
    #expect(LivelineMath.momentum(pts) == (curve.momentum == "up" ? 1 : curve.momentum == "down" ? -1 : 0))
  }
  for schedule in golden.schedules {
    var value = 0.0
    for _ in 0..<schedule.hz { value = LivelineMath.lerp(value, 100, speed: 0.08, milliseconds: 1000 / Double(schedule.hz)) }
    #expect(close(value, schedule.value))
  }
  for i in golden.intervals { #expect(LivelineMath.niceTimeInterval(i.window) == i.value) }
  for point in golden.loading { #expect(close(LivelineMath.loadingY(point.t, milliseconds: 1200), point.value)) }
}

@Test func cleansInvalidAndDuplicateTimesWithoutDroppingNegativeReturns() {
  let points = LivelineMath.clean([.init(time: 2, value: 2), .init(time: 1, value: -3),
                                   .init(time: 2, value: 4), .init(time: .nan, value: 1), .init(time: 3, value: .infinity)])
  #expect(points == [.init(time: 1, value: -3), .init(time: 2, value: 4)])
}

@Test func tinyPricesHaveRelativeRangeAndDistinctGridValues() {
  let range = LivelineMath.range([1e-8, 1e-8])
  #expect(range.lowerBound > 0)
  #expect(range.upperBound - range.lowerBound < 1e-8)
  let step = LivelineMath.gridInterval(range: range.upperBound - range.lowerBound, height: 260)
  #expect(step > 0 && step < 1e-8)
}

private func input(observation: LivelineObservation? = nil) -> LivelineInput {
  .init(id: "btc|30d", series: [.init(id: "price", points: [.init(time: 0, value: 10), .init(time: 100, value: 12)])],
        viewport: .historical(0...120), observation: observation)
}
private func settle(_ engine: LivelineEngine, from start: Double = 0, frames: Int = 180) {
  for frame in 0..<frames { engine.advance(monotonicTime: start + Double(frame) / 60, marketTime: 120) }
}

@Test func liveObservationIsProvisionalAndScrubUsesRenderedSpline() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  let original = input()
  engine.update(original, configuration: cfg, marketTime: 120); settle(engine)
  engine.update(input(observation: .init(time: 110, value: 14)), configuration: cfg, marketTime: 120)
  settle(engine, from: 3)
  #expect(engine.input?.series[0].points == original.series[0].points)
  #expect(engine.splines["price"]?.points.count == 3)
  #expect(engine.selection(at: 105)?.value == engine.splines["price"]?.value(at: 105))
  #expect(engine.selection(at: 110)?.value == 14)
  engine.update(input(observation: .init(time: 105, value: 999)), configuration: cfg, marketTime: 120)
  settle(engine, from: 6)
  #expect(engine.displayedValue == 14)
}

@Test func pauseFreezesAndResumeUsesLatestInput() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(input(), configuration: cfg, marketTime: 120); settle(engine)
  cfg.paused = true
  engine.update(input(observation: .init(time: 110, value: 20)), configuration: cfg, marketTime: 120)
  settle(engine, from: 3)
  #expect(engine.displayedValue == 12)
  cfg.paused = false
  engine.update(input(observation: .init(time: 110, value: 20)), configuration: cfg, marketTime: 120)
  settle(engine, from: 6)
  #expect(engine.displayedValue == 20)
}

@Test func projectionAndAllOverlayExtentsShareRangeButNotLivePrice() {
  let engine = LivelineEngine()
  var data = input()
  data.series += [.init(id: "shull", points: [.init(time: 0, value: 30), .init(time: 100, value: 40)]),
                  .init(id: "projection", points: [.init(time: 100, value: 12), .init(time: 120, value: 50)])]
  data.projectionID = "projection"
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(data, configuration: cfg, marketTime: 120); settle(engine)
  #expect(engine.yRange.upperBound >= 50)
  #expect(engine.displayedValue == 12)
  #expect(engine.selection(at: 115)?.isProjection == true)
  #expect(engine.selection(at: 120)?.value == 50)
  #expect(engine.xRange == 0...120)
}

@Test func identityChangeAndReducedMotionClearInspectionAndSettle() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(input(), configuration: cfg, marketTime: 120); settle(engine)
  engine.selectedTime = 50
  var next = input(); next.id = "eth|30d"; next.series[0].points = [.init(time: 0, value: 100), .init(time: 100, value: 200)]
  engine.update(next, configuration: cfg, marketTime: 120); settle(engine, from: 3)
  #expect(engine.selectedTime == nil)
  #expect(engine.displayedValue == 200)
  #expect(!engine.isAnimating)
}

@Test func placeholderNeverProducesHistoricalSelection() {
  let engine = LivelineEngine()
  var next = input(); next.state = .placeholder
  engine.update(next, configuration: .init(), marketTime: 120); settle(engine)
  #expect(engine.reveal == 0)
  #expect(engine.selection(at: 50) == nil)
}

@Test func observationsOlderThanHistoryCannotMoveTheBadgeAwayFromTheCurve() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(input(observation: .init(time: 90, value: 999)), configuration: cfg, marketTime: 120)
  settle(engine)
  #expect(engine.displayedValue == 12)
  #expect(engine.splines["price"]?.points.last?.value == engine.displayedValue)
}

@Test func resumeUsesTheNewestSnapshotRatherThanAnEarlierPausedSnapshot() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(input(), configuration: cfg, marketTime: 120); settle(engine)
  cfg.paused = true
  engine.update(input(observation: .init(time: 110, value: 20)), configuration: cfg, marketTime: 120)
  cfg.paused = false
  engine.update(input(observation: .init(time: 115, value: 25)), configuration: cfg, marketTime: 120)
  settle(engine, from: 3)
  #expect(engine.displayedValue == 25)
}

@Test func largeStaticSeriesSettlesWithoutContinuouslyChangingGeometry() {
  let points = (0..<10_000).map { LivelinePoint(time: Double($0), value: 100 + sin(Double($0) / 30)) }
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true; cfg.pulse = false
  engine.update(.init(id: "large", series: [.init(id: "price", points: points)], viewport: .historical(0...9999)), configuration: cfg, marketTime: 9999)
  settle(engine)
  let before = ContinuousClock.now
  for frame in 0..<1200 { engine.advance(monotonicTime: 3 + Double(frame) / 60, marketTime: 9999) }
  let duration = before.duration(to: .now)
  print("Liveline 10,000-point static engine / 1,200 frames: \(duration)")
  #expect(engine.splines["price"]?.points == points)
  #expect(!engine.isAnimating)
  #expect(engine.yRange.contains(99) && engine.yRange.contains(101))
}

@Test func historicalRefreshInterpolatesVisibleEndpointAndCanRetarget() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.pulse = false
  engine.update(input(), configuration: cfg, marketTime: 120); settle(engine)
  var refreshed = input(); refreshed.series[0].points[1].value = 20
  engine.update(refreshed, configuration: cfg, marketTime: 120)
  #expect(engine.splines["price"]?.points.last?.value == 12)
  engine.advance(monotonicTime: 3, marketTime: 120)
  #expect(engine.displayedValue > 12 && engine.displayedValue < 20)
  #expect(engine.selection(at: 100)?.value == engine.displayedValue)
  #expect(engine.input?.series[0].points.last?.value == 20)
  let intermediate = engine.displayedValue
  refreshed.series[0].points[1].value = 8
  engine.update(refreshed, configuration: cfg, marketTime: 120)
  #expect(engine.splines["price"]?.points.last?.value == intermediate)
  settle(engine, from: 3.02)
  #expect(engine.displayedValue == 8)
  #expect(engine.splines["price"]?.points.map(\.time) == [0, 100])
}

@Test func releasedInspectionFadesAtItsLastPositionAndCanBeInterrupted() {
  let engine = LivelineEngine()
  engine.update(input(), configuration: .init(), marketTime: 120); settle(engine)
  engine.selectedTime = 40; settle(engine, from: 3)
  engine.selectedTime = nil
  #expect(engine.inspectionTime == 40)
  engine.advance(monotonicTime: 6, marketTime: 120)
  #expect(engine.scrubAmount > 0 && engine.scrubAmount < 1)
  #expect(engine.inspectionTime == 40)
  engine.selectedTime = 70
  #expect(engine.inspectionTime == 70)
  engine.selectedTime = nil; settle(engine, from: 6.02)
  #expect(engine.inspectionTime == nil)
  #expect(engine.scrubAmount == 0)
}

@Test func changingTokenDuringScrubExitCannotLeaveAGhostCursor() {
  let engine = LivelineEngine()
  engine.update(input(), configuration: .init(), marketTime: 120); settle(engine)
  engine.selectedTime = 40; settle(engine, from: 3)
  engine.selectedTime = nil
  var next = input(); next.id = "eth|30d"
  engine.update(next, configuration: .init(), marketTime: 120)
  #expect(engine.inspectionTime == nil)
  #expect(engine.scrubAmount == 0)
}

@Test func reducedMotionEndsInspectionWithoutATrailingAnimation() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  engine.update(input(), configuration: cfg, marketTime: 120)
  engine.selectedTime = 50; engine.advance(monotonicTime: 0, marketTime: 120)
  engine.selectedTime = nil; engine.advance(monotonicTime: 0.02, marketTime: 120)
  #expect(engine.inspectionTime == nil)
  #expect(engine.scrubAmount == 0)
}

// MARK: - Endpoint patching and incremental updates

private func sameTangents(_ a: LivelineSpline, _ b: LivelineSpline) -> Bool {
  a.points == b.points && a.tangents.count == b.tangents.count
    && zip(a.tangents, b.tangents).allSatisfy { $0 == $1 || close($0, $1) }
}

@Test func patchingTheEndpointMatchesAFullSplineRebuild() {
  var generator = SystemRandomNumberGenerator()
  for n in [2, 3, 4, 5, 8, 50] {
    for _ in 0..<40 {
      // Mixed monotone runs and reversals exercise every limiter branch, including zero deltas.
      var points: [LivelinePoint] = []
      var value = 100.0
      for i in 0..<n {
        let step = Double.random(in: -5...5, using: &generator)
        value += Int.random(in: 0..<6, using: &generator) == 0 ? 0 : step
        points.append(.init(time: Double(i) * Double.random(in: 0.5...2, using: &generator) + Double(i), value: value))
      }
      let original = LivelineSpline(points)
      var replaced = original
      var replacedPoints = points
      replacedPoints[n - 1] = .init(time: points[n - 1].time + Double.random(in: 0...1, using: &generator),
                                    value: value + Double.random(in: -20...20, using: &generator))
      replaced.replaceLast(replacedPoints[n - 1])
      #expect(sameTangents(replaced, LivelineSpline(replacedPoints)))
      // A second patch on an already patched spline must still be exact.
      replacedPoints[n - 1].value -= 7
      replaced.replaceLast(replacedPoints[n - 1])
      #expect(sameTangents(replaced, LivelineSpline(replacedPoints)))

      var appended = original
      let extra = LivelinePoint(time: points[n - 1].time + 1, value: value + Double.random(in: -20...20, using: &generator))
      appended.append(extra)
      #expect(sameTangents(appended, LivelineSpline(points + [extra])))
      appended.replaceLast(.init(time: extra.time, value: extra.value + 3))
      #expect(sameTangents(appended, LivelineSpline(points + [.init(time: extra.time, value: extra.value + 3)])))
      let second = LivelinePoint(time: extra.time + 2, value: extra.value - 4)
      appended.append(second)
      #expect(sameTangents(appended, LivelineSpline(points + [.init(time: extra.time, value: extra.value + 3), second])))
    }
  }
}

@Test func animatedEndpointNeverBumpsTheRevisionOrRebuildsHistory() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.pulse = false
  let points = (0..<200).map { LivelinePoint(time: Double($0), value: 100 + sin(Double($0) / 9) * 4) }
  let base = LivelineInput(id: "btc|30d", series: [.init(id: "price", points: points)], viewport: .historical(0...220))
  #expect(engine.update(base, configuration: cfg, marketTime: 220) == .data)
  settle(engine, frames: 30)
  let revision = engine.revision, builds = engine.splineBuildCount
  #expect(engine.update(base, configuration: cfg, marketTime: 220) == .none)
  var live = base; live.observation = .init(time: 210, value: 112)
  #expect(engine.update(live, configuration: cfg, marketTime: 220) == .observation)
  #expect(engine.splines["price"]?.points.count == 201)
  #expect(engine.endpointAppended)
  for frame in 0..<120 {
    engine.advance(monotonicTime: 1 + Double(frame) / 60, marketTime: 220)
    #expect(engine.revision == revision)
  }
  #expect(engine.splineBuildCount == builds)
  #expect(engine.displayedValue == 112)
  #expect(engine.splines["price"]?.points.last == .init(time: 210, value: 112))
  #expect(engine.input?.series[0].points == points)
  // A later tick that normalization rejects compares equal to the raw input the host keeps sending.
  var stale = base; stale.observation = .init(time: 150, value: 1)
  #expect(engine.update(stale, configuration: cfg, marketTime: 220) == .observation)
  #expect(engine.update(stale, configuration: cfg, marketTime: 220) == .none)
  #expect(engine.revision == revision)
}

@Test func incrementalRangeMatchesAFullScanWhileTheEndpointAnimates() {
  let points = (0..<300).map { LivelinePoint(time: Double($0), value: 50 + cos(Double($0) / 15) * 10) }
  var cfg = LivelineConfiguration(); cfg.pulse = false
  let live = LivelineInput(id: "eth|7d", series: [.init(id: "price", points: points),
                                                  .init(id: "shull", points: points.map { .init(time: $0.time, value: $0.value * 1.1) })],
                           viewport: .historical(0...330), observation: .init(time: 320, value: 95))
  let incremental = LivelineEngine()
  incremental.update(live, configuration: cfg, marketTime: 330)
  let scans = incremental.rangeScanCount
  for frame in 0..<90 {
    incremental.advance(monotonicTime: Double(frame) / 60, marketTime: 330)
    #expect(incremental.splines["price"]?.points.last?.value == incremental.displayedValue)
    // A fresh engine starts at the same endpoint and scans every point for its initial range.
    let fresh = LivelineEngine()
    var snapshot = live; snapshot.observation = .init(time: 320, value: incremental.displayedValue)
    fresh.update(snapshot, configuration: cfg, marketTime: 330)
    let target = incremental.debugTargetY
    #expect(close(fresh.yRange.lowerBound, target.lowerBound) && close(fresh.yRange.upperBound, target.upperBound))
  }
  #expect(incremental.rangeScanCount == scans)
}

@Test func emphasisChangesKeepSplinesAndObservationChangesSkipCleaning() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.seriesLabels = ["a": "A", "b": "B"]
  var data = LivelineInput(id: "cmp|1d", series: [.init(id: "a", points: [.init(time: 0, value: 1), .init(time: 10, value: 2)]),
                                                  .init(id: "b", points: [.init(time: 0, value: 3), .init(time: 10, value: 1)])],
                           primaryID: "a", viewport: .historical(0...10))
  engine.update(data, configuration: cfg, marketTime: 10)
  let builds = engine.splineBuildCount
  data.series[1].opacity = 0.18
  #expect(engine.update(data, configuration: cfg, marketTime: 10) == .emphasis)
  #expect(engine.input?.series[1].opacity == 0.18)
  #expect(engine.splineBuildCount == builds)
  data.series[0].points.append(.init(time: 20, value: 5))
  #expect(engine.update(data, configuration: cfg, marketTime: 20) == .data)
  #expect(engine.splineBuildCount == builds + 2)
}

@Test func emptyAndSinglePointPrimarySeriesDoNotTrapWhileLoading() {
  let engine = LivelineEngine()
  var cfg = LivelineConfiguration(); cfg.reduceMotion = true
  let viewport = input().viewport
  // Loading state before any history arrives: the primary series is empty.
  let empty = LivelineInput(id: "t", series: [LivelineSeries(id: "price", points: [])], viewport: viewport, state: .loading)
  engine.update(empty, configuration: cfg, marketTime: 120); settle(engine, frames: 10)
  #expect(engine.splines["price"]?.points.isEmpty ?? true)
  // A single observed point must also be representable.
  let one = LivelineInput(id: "t", series: [LivelineSeries(id: "price", points: [.init(time: 100, value: 10)])], viewport: viewport)
  engine.update(one, configuration: cfg, marketTime: 120); settle(engine, frames: 10)
  #expect(engine.selection(at: 100)?.value == 10)
}
