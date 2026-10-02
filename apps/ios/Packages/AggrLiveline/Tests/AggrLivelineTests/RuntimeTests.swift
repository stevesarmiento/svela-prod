import CoreGraphics
import Foundation
import Testing
@testable import AggrLiveline

// MARK: - Scrub gesture policy

@Test func scrubGestureHoldStartsScrub() {
  var gesture = LivelineScrubGesture()
  #expect(gesture.began(at: CGPoint(x: 100, y: 50)) == .none)
  // Jitter inside the hold slop still counts as holding still.
  #expect(gesture.moved(to: CGPoint(x: 102, y: 51)) == .none)
  #expect(gesture.holdTimerFired() == .start(x: 102))
  #expect(gesture.isScrubbing)
  #expect(gesture.moved(to: CGPoint(x: 110, y: 51)) == .update(x: 110))
  #expect(gesture.ended() == .end)
  #expect(gesture.phase == .idle)
}

@Test func scrubGestureHoldRefusedAfterSlopTravel() {
  var gesture = LivelineScrubGesture()
  _ = gesture.began(at: CGPoint(x: 100, y: 50))
  _ = gesture.moved(to: CGPoint(x: 100, y: 56))
  #expect(gesture.holdTimerFired() == .none)
  #expect(!gesture.isScrubbing)
}

@Test func scrubGestureHorizontalTravelCommits() {
  var gesture = LivelineScrubGesture()
  _ = gesture.began(at: CGPoint(x: 100, y: 50))
  // Under the commit distance: still pending.
  #expect(gesture.moved(to: CGPoint(x: 112, y: 52)) == .none)
  #expect(gesture.moved(to: CGPoint(x: 118, y: 54)) == .start(x: 118))
  #expect(gesture.isScrubbing)
}

@Test func scrubGestureVerticalTravelNeverCommits() {
  var gesture = LivelineScrubGesture()
  _ = gesture.began(at: CGPoint(x: 100, y: 50))
  #expect(gesture.moved(to: CGPoint(x: 120, y: 80)) == .none)
  #expect(!gesture.isScrubbing)
  #expect(gesture.ended() == .none)
}

@Test func scrubGestureRefusesAncestorPanMidScrub() {
  var gesture = LivelineScrubGesture()
  _ = gesture.began(at: CGPoint(x: 100, y: 50))
  #expect(gesture.shouldAllowPan(velocity: CGPoint(x: 10, y: 200)))
  #expect(!gesture.shouldAllowPan(velocity: CGPoint(x: 200, y: 10)))
  _ = gesture.holdTimerFired()
  #expect(gesture.isScrubbing)
  #expect(!gesture.shouldAllowPan(velocity: CGPoint(x: 0, y: 500)))
}

// MARK: - Render buffer

@MainActor
@Test func renderBufferReusesContextForSamePixelSize() {
  let buffer = LivelineRenderBuffer()
  let first = buffer.context(pixelWidth: 300, pixelHeight: 200)
  let second = buffer.context(pixelWidth: 300, pixelHeight: 200)
  #expect(first != nil)
  #expect(first === second)
  let resized = buffer.context(pixelWidth: 301, pixelHeight: 200)
  #expect(resized !== first)
}

@Test func selectionEqualityIgnoresX() {
  let a = LivelineSelection(time: 5, value: 1, values: ["price": 1], isProjection: false, nearestObservation: nil, x: 10)
  let b = LivelineSelection(time: 5, value: 1, values: ["price": 1], isProjection: false, nearestObservation: nil, x: 42)
  #expect(a == b)
  var c = a; c.value = 2
  #expect(a != c)
}

#if canImport(UIKit)
import UIKit

// MARK: - Selection geometry

@Test @MainActor func selectionCarriesCrosshairX() {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
  let chart = LivelineChartView(tracksScrollVisibility: false)
  chart.frame = CGRect(x: 0, y: 0, width: 390, height: 260)
  window.addSubview(chart)
  window.isHidden = false
  window.layoutIfNeeded()
  defer { chart.stop(); window.isHidden = true }
  var config = LivelineConfiguration()
  config.scrub = true
  config.scrubStartHaptic = false
  config.reduceMotion = true
  config.pulse = false
  let points = (0..<100).map { LivelinePoint(time: Double($0 + 1), value: 10 + sin(Double($0) / 7) * 3) }
  let input = LivelineInput(id: "x", series: [.init(id: "price", points: points)], viewport: .historical(1...100))
  nonisolated(unsafe) var captured: LivelineSelection?
  chart.apply(input: input, configuration: config, isActive: true,
              formatValue: { String($0) }, formatVolume: { String($0) }, formatTime: { String($0) },
              onSelection: { captured = $0 })
  chart.apply(.start(x: 120))
  let first = try? #require(captured)
  #expect(first?.x != nil)
  if let first, let x = first.x {
    #expect(abs(x - chart.currentLayout.toX(first.time)) < 0.001)
    #expect(abs(x - 120) < 0.5)
  }
  chart.apply(.update(x: 120.4))
  #expect(captured == first)
  chart.apply(.update(x: 200))
  #expect(captured != first)
  #expect(captured?.x.map { abs($0 - 200) < 0.5 } == true)
  chart.apply(.end)
  #expect(captured == nil)
}

// MARK: - Pulse layers

@MainActor
@Test func pulseLayersSyncCreatesAnimatesAndRemovesRings() {
  let pulses = LivelinePulseLayers()
  let host = CALayer()
  let bounds = CGRect(x: 0, y: 0, width: 320, height: 200)
  let pulse = LivelinePulse(id: "price", point: CGPoint(x: 280, y: 90), color: .white,
                            growth: 12, peakAlpha: 0.35, opacity: 1)
  pulses.sync([pulse], in: host, bounds: bounds, scale: 2, animating: true)
  #expect(pulses.ringCount == 1)
  #expect(pulses.container.superlayer === host)
  #expect(pulses.isAnimating(id: "price"))
  #expect(pulses.holderLayer(id: "price")?.position == pulse.point)

  // Not in a window: the ring stays but its animation is removed.
  pulses.sync([pulse], in: host, bounds: bounds, scale: 2, animating: false)
  #expect(pulses.ringCount == 1)
  #expect(!pulses.isAnimating(id: "price"))

  // A stopped ring never shows frozen: the shape is invisible without its animation.
  #expect(pulses.shapeLayer(id: "price")?.opacity == 0)

  pulses.sync([], in: host, bounds: bounds, scale: 2, animating: true)
  #expect(pulses.ringCount == 0)
}
#endif

@MainActor
@Test func renderBufferAlternatesBetweenTwoContextsAfterSwap() {
  let buffer = LivelineRenderBuffer()
  let first = buffer.context(pixelWidth: 300, pixelHeight: 200)
  buffer.swap()
  let second = buffer.context(pixelWidth: 300, pixelHeight: 200)
  #expect(first != nil && second != nil)
  #expect(first !== second)
  buffer.swap()
  #expect(buffer.context(pixelWidth: 300, pixelHeight: 200) === first)
  buffer.swap()
  #expect(buffer.context(pixelWidth: 300, pixelHeight: 200) === second)
}
