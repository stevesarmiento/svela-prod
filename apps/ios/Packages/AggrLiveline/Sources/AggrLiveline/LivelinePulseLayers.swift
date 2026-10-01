#if canImport(UIKit)
import UIKit
import QuartzCore

/// Where the live-dot pulse ring should be shown this frame (see `LivelinePulseLayers`).
/// The ring grows from radius 9 to `9 + growth` while fading from `peakAlpha` to 0 over 0.9 s,
/// then rests 0.6 s; `opacity` scales it (the dot dims while scrubbing).
struct LivelinePulse: Equatable {
  var id: String
  var point: CGPoint
  var color: LivelineColor
  var growth: CGFloat
  var peakAlpha: CGFloat
  var opacity: CGFloat
}

/// Live-dot pulse rings as Core Animation layers.
///
/// The ring used to be drawn into the chart bitmap, so it froze whenever the display link paused
/// (a settled chart). Here each ring is a `CAShapeLayer` with a repeating animation that the
/// render server runs on its own; the chart only moves the ring when the dot moves. The keyframes
/// reproduce the bitmap version: radius 9 -> 9 + growth and alpha peak -> 0 over 0.9 s, then
/// hidden for the rest of a 1.5 s cycle, with a constant 1.5 pt stroke.
@MainActor
final class LivelinePulseLayers {
  static let period: CFTimeInterval = 1.5
  static let expandDuration: CFTimeInterval = 0.9
  static let baseRadius: CGFloat = 9
  static let animationKey = "liveline.pulse"

  private struct Ring {
    let holder: CALayer
    let shape: CAShapeLayer
    var growth: CGFloat
    var peakAlpha: CGFloat
  }

  /// Clips rings to the chart bounds like the bitmap did.
  let container = CALayer()
  private var rings: [String: Ring] = [:]

  init() {
    container.masksToBounds = true
    container.actions = Self.noActions
  }

  private static let noActions: [String: CAAction] = [
    "position": NSNull(), "bounds": NSNull(), "frame": NSNull(), "opacity": NSNull(),
    "strokeColor": NSNull(), "sublayers": NSNull(), "contentsScale": NSNull(), "hidden": NSNull(),
  ]

  var ringCount: Int { rings.count }

  func isAnimating(id: String = "") -> Bool {
    rings[id]?.shape.animation(forKey: Self.animationKey) != nil
  }

  func holderLayer(id: String = "") -> CALayer? { rings[id]?.holder }
  func shapeLayer(id: String = "") -> CAShapeLayer? { rings[id]?.shape }

  /// Shows exactly `pulses`, animating only while `animating` (the view is in a window).
  func sync(_ pulses: [LivelinePulse], in host: CALayer, bounds: CGRect, scale: CGFloat, animating: Bool) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }

    if container.superlayer !== host {
      host.addSublayer(container)
    }
    container.frame = bounds
    container.contentsScale = scale

    let wanted = Set(pulses.map(\.id))
    for (id, ring) in rings where !wanted.contains(id) {
      ring.holder.removeFromSuperlayer()
      rings[id] = nil
    }

    for pulse in pulses {
      var ring = rings[pulse.id] ?? makeRing()
      if ring.growth != pulse.growth || ring.peakAlpha != pulse.peakAlpha {
        ring.growth = pulse.growth
        ring.peakAlpha = pulse.peakAlpha
        ring.shape.removeAnimation(forKey: Self.animationKey)
      }
      ring.holder.position = pulse.point
      ring.holder.opacity = Float(pulse.opacity)
      ring.shape.strokeColor = pulse.color.uiColor.cgColor
      ring.shape.contentsScale = scale
      if animating {
        if ring.shape.animation(forKey: Self.animationKey) == nil {
          ring.shape.add(Self.makeAnimation(growth: ring.growth, peakAlpha: ring.peakAlpha), forKey: Self.animationKey)
        }
      } else {
        ring.shape.removeAnimation(forKey: Self.animationKey)
      }
      rings[pulse.id] = ring
    }
  }

  /// Stops every ring (view left its window); rings stay in place, invisible.
  func stopAnimating() {
    for ring in rings.values {
      ring.shape.removeAnimation(forKey: Self.animationKey)
    }
  }

  func removeAll() {
    for ring in rings.values {
      ring.holder.removeFromSuperlayer()
    }
    rings.removeAll()
  }

  private func makeRing() -> Ring {
    let holder = CALayer()
    holder.actions = Self.noActions
    holder.bounds = .zero
    let shape = CAShapeLayer()
    shape.actions = Self.noActions
    shape.fillColor = nil
    shape.lineWidth = 1.5
    shape.path = Self.circle(radius: Self.baseRadius)
    // Invisible unless the animation drives it, so a stopped ring never shows frozen.
    shape.opacity = 0
    holder.addSublayer(shape)
    container.addSublayer(holder)
    return Ring(holder: holder, shape: shape, growth: -1, peakAlpha: -1)
  }

  static func circle(radius: CGFloat) -> CGPath {
    CGPath(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2), transform: nil)
  }

  static func makeAnimation(growth: CGFloat, peakAlpha: CGFloat) -> CAAnimation {
    let split = NSNumber(value: expandDuration / period)
    let path = CAKeyframeAnimation(keyPath: "path")
    path.values = [circle(radius: baseRadius), circle(radius: baseRadius + growth), circle(radius: baseRadius + growth)]
    path.keyTimes = [0, split, 1]

    let opacity = CAKeyframeAnimation(keyPath: "opacity")
    opacity.values = [Float(peakAlpha), Float(0), Float(0)]
    opacity.keyTimes = [0, split, 1]

    let group = CAAnimationGroup()
    group.animations = [path, opacity]
    group.duration = period
    group.repeatCount = .infinity
    group.isRemovedOnCompletion = false
    group.timingFunction = CAMediaTimingFunction(name: .linear)
    return group
  }
}
#endif
