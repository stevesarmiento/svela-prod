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

#if canImport(UIKit)
import UIKit

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
