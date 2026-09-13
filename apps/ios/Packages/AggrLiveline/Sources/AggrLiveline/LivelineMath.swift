import Foundation

/// Adapted from benjitaylor/liveline's MIT-licensed math modules. See Resources/Liveline-MIT.txt.
public enum LivelineMath {
  public static func lerp(_ current: Double, _ target: Double, speed: Double, milliseconds: Double) -> Double {
    current + (target - current) * (1 - pow(1 - min(1, max(0, speed)), max(0, milliseconds) / 16.67))
  }

  public static func clean(_ points: [LivelinePoint]) -> [LivelinePoint] {
    var unique: [Double: Double] = [:]
    for p in points where p.time.isFinite && p.value.isFinite { unique[p.time] = p.value }
    return unique.keys.sorted().map { .init(time: $0, value: unique[$0]!) }
  }

  public static func range(_ values: [Double], profile: LivelineProfile = .aggr, exaggerate: Bool = false) -> ClosedRange<Double> {
    let finite = values.filter(\.isFinite)
    guard let lo = finite.min(), let hi = finite.max() else { return 0...1 }
    let raw = hi - lo
    if raw == 0 {
      let span = profile == .reference ? (exaggerate ? 0.04 : 0.4) : max(abs(lo) * 0.01, 1e-12)
      return (lo - span / 2)...(hi + span / 2)
    }
    let pad = raw * (exaggerate ? 0.01 : 0.12)
    return (lo - pad)...(hi + pad)
  }

  public static func momentum(_ points: [LivelinePoint]) -> Int {
    guard points.count >= 5 else { return 0 }
    let tail = points.suffix(20).map(\.value)
    let span = (tail.max() ?? 0) - (tail.min() ?? 0)
    guard span > 0 else { return 0 }
    let change = points.last!.value - points[points.count - 5].value
    return change > span * 0.12 ? 1 : change < -span * 0.12 ? -1 : 0
  }

  public static func loadingY(_ t: Double, milliseconds: Double) -> Double {
    let scroll = milliseconds * 0.001
    return 0.5 + 0.07 * (sin(t * 9.4 + scroll) * 0.55 + sin(t * 15.7 + scroll * 1.3) * 0.3 + sin(t * 4.2 + scroll * 0.7) * 0.15)
  }

  public static func gridInterval(range: Double, height: Double, previous: Double = 0) -> Double {
    guard range.isFinite, range > 0, height > 0 else { return 1 }
    let pixels = height / range
    if previous > 0, previous * pixels >= 18, previous * pixels <= 144 { return previous }
    var best = Double.infinity
    for divisors in [[2.0, 2.5, 2.0], [2.0, 2.0, 2.5], [2.5, 2.0, 2.0]] {
      var span = pow(10, ceil(log10(range))), i = 0
      while span / divisors[i % 3] * pixels >= 36, i < 100 {
        span /= divisors[i % 3]; i += 1
      }
      best = min(best, span)
    }
    return best.isFinite && best > 0 ? best : range / 5
  }

  public static func niceTimeInterval(_ window: Double) -> Double {
    for (maxWindow, interval) in [(15.0, 2.0), (30, 5), (60, 10), (120, 15), (300, 30), (600, 60),
                                  (1800, 300), (3600, 600), (14400, 1800), (43200, 3600), (86400, 7200), (604800, 86400)] {
      if window <= maxWindow { return interval }
    }
    return 604800
  }
}

/// Fritsch–Carlson monotone cubic: the renderer and inspection evaluate these same coefficients.
public struct LivelineSpline: Sendable {
  public let points: [LivelinePoint]
  public let tangents: [Double]
  public init(_ points: [LivelinePoint]) {
    self.points = points
    let n = points.count
    guard n > 1 else { tangents = Array(repeating: 0, count: n); return }
    let delta = (0..<(n - 1)).map { i -> Double in
      let h = points[i + 1].time - points[i].time
      return h > 0 ? (points[i + 1].value - points[i].value) / h : 0
    }
    var m = Array(repeating: 0.0, count: n)
    m[0] = delta[0]; m[n - 1] = delta[n - 2]
    if n > 2 {
      for i in 1..<(n - 1) { m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2 }
    }
    for i in 0..<(n - 1) {
      if delta[i] == 0 { m[i] = 0; m[i + 1] = 0 }
      else {
        let a = m[i] / delta[i], b = m[i + 1] / delta[i], s2 = a * a + b * b
        if s2 > 9 { let s = 3 / sqrt(s2); m[i] = s * a * delta[i]; m[i + 1] = s * b * delta[i] }
      }
    }
    tangents = m
  }
  public func interval(at time: Double) -> Int? {
    guard points.count > 1 else { return nil }
    var lo = 0, hi = points.count - 1
    while hi - lo > 1 {
      let mid = (lo + hi) / 2
      if points[mid].time <= time { lo = mid } else { hi = mid }
    }
    return lo
  }
  public func value(at time: Double, clamp: Bool = true) -> Double? {
    guard let first = points.first, let last = points.last else { return nil }
    if time <= first.time { return clamp || time == first.time ? first.value : nil }
    if time >= last.time { return clamp || time == last.time ? last.value : nil }
    guard let i = interval(at: time) else { return first.value }
    let a = points[i], b = points[i + 1], h = b.time - a.time
    guard h > 0 else { return a.value }
    let t = (time - a.time) / h, t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * a.value + (t3 - 2 * t2 + t) * h * tangents[i]
      + (-2 * t3 + 3 * t2) * b.value + (t3 - t2) * h * tangents[i + 1]
  }
  public func nearest(at time: Double) -> LivelinePoint? {
    guard let i = interval(at: time) else { return points.first }
    return abs(points[i].time - time) <= abs(points[i + 1].time - time) ? points[i] : points[i + 1]
  }
}
