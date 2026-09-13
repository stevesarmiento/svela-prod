import AggrCore
import SwiftUI

/// Canvas sparkline mirroring liveline (patched): monotone-cubic path, optional colored tail segment,
/// 12% vertical margin, left fade mask, no axis, no dot.
struct Sparkline: View {
  let points: [TimePoint]
  var lineWidth: CGFloat = 1.5
  var neutral: Color = .white.opacity(0.19)
  /// If set, the segment with epochSeconds >= tailStart is drawn in `tailColor`.
  var tailStart: Int? = nil
  var tailColor: Color? = nil
  var fadeLeading = true
  /// Single-color mode (e.g. green/red by sign) — draws the whole line in this color.
  var monoColor: Color? = nil

  var body: some View {
    Canvas { ctx, size in
      guard points.count >= 2 else { return }
      let xs = points.map { Double($0.epochSeconds) }
      let ys = points.map(\.value)
      guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return }
      let spanX = max(maxX - minX, 1)
      let range = max(maxY - minY, 1e-12)
      let margin = range * 0.12
      let lo = minY - margin, hi = maxY + margin
      func pt(_ i: Int) -> CGPoint {
        CGPoint(x: (xs[i] - minX) / spanX * size.width,
                y: size.height - (ys[i] - lo) / (hi - lo) * size.height)
      }
      let cg = (0..<points.count).map(pt)
      let full = MonotoneCubic.path(through: cg)
      let style = StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
      if let monoColor {
        ctx.stroke(full, with: .color(monoColor), style: style)
        return
      }
      ctx.stroke(full, with: .color(neutral), style: style)
      if let tailStart, let tailColor {
        let tail = cg.enumerated().filter { points[$0.offset].epochSeconds >= tailStart }.map(\.element)
        if tail.count >= 2 {
          ctx.stroke(MonotoneCubic.path(through: tail), with: .color(tailColor), style: style)
        }
      }
    }
    .mask {
      if fadeLeading {
        LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.12), .init(color: .black, location: 1)],
                       startPoint: .leading, endPoint: .trailing)
      } else {
        Color.black
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// Fritsch–Carlson monotone cubic interpolation (liveline patch #2).
enum MonotoneCubic {
  static func path(through p: [CGPoint]) -> Path {
    var path = Path()
    guard p.count >= 2 else { return path }
    let n = p.count
    var dx = [CGFloat](repeating: 0, count: n - 1), dy = dx, m = dx
    for i in 0..<(n - 1) {
      dx[i] = p[i + 1].x - p[i].x
      dy[i] = p[i + 1].y - p[i].y
      m[i] = dx[i] == 0 ? 0 : dy[i] / dx[i]
    }
    var t = [CGFloat](repeating: 0, count: n)
    t[0] = m[0]; t[n - 1] = m[n - 2]
    for i in 1..<(n - 1) {
      if m[i - 1] * m[i] <= 0 { t[i] = 0 } else {
        let w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1]
        t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i])
      }
    }
    path.move(to: p[0])
    for i in 0..<(n - 1) {
      let h = dx[i]
      let c1 = CGPoint(x: p[i].x + h / 3, y: p[i].y + t[i] * h / 3)
      let c2 = CGPoint(x: p[i + 1].x - h / 3, y: p[i + 1].y - t[i + 1] * h / 3)
      path.addCurve(to: p[i + 1], control1: c1, control2: c2)
    }
    return path
  }

  /// Value on the spline at `x` (same interpolation the drawn path uses — liveline patch #2 for scrub readouts).
  static func interpolate(points: [TimePoint], atEpochSeconds x: Double) -> Double? {
    guard points.count >= 2 else { return points.first?.value }
    let xs = points.map { Double($0.epochSeconds) }, ys = points.map(\.value)
    if x <= xs[0] { return ys[0] }
    if x >= xs[xs.count - 1] { return ys[ys.count - 1] }
    var lo = 0, hi = xs.count - 1
    while hi - lo > 1 { let mid = (lo + hi) / 2; if xs[mid] <= x { lo = mid } else { hi = mid } }
    let h = xs[hi] - xs[lo]
    guard h > 0 else { return ys[lo] }
    let n = xs.count
    func slope(_ i: Int) -> Double { (ys[i + 1] - ys[i]) / max(xs[i + 1] - xs[i], 1e-12) }
    func tangent(_ i: Int) -> Double {
      if i == 0 { return slope(0) }
      if i == n - 1 { return slope(n - 2) }
      let m0 = slope(i - 1), m1 = slope(i)
      if m0 * m1 <= 0 { return 0 }
      let d0 = xs[i] - xs[i - 1], d1 = xs[i + 1] - xs[i]
      let w1 = 2 * d1 + d0, w2 = d1 + 2 * d0
      return (w1 + w2) / (w1 / m0 + w2 / m1)
    }
    let s = (x - xs[lo]) / h
    let h00 = 2 * s * s * s - 3 * s * s + 1, h10 = s * s * s - 2 * s * s + s
    let h01 = -2 * s * s * s + 3 * s * s, h11 = s * s * s - s * s
    return h00 * ys[lo] + h10 * h * tangent(lo) + h01 * ys[hi] + h11 * h * tangent(hi)
  }
}

#if DEBUG
#Preview("Trend sparklines") {
  VStack(spacing: 24) {
    Sparkline(points: PreviewFixtures.line).frame(height: 80)
    Sparkline(points: PreviewFixtures.line, monoColor: .gainGreen).frame(height: 50)
    Sparkline(points: []).frame(height: 50)
  }.padding().preferredColorScheme(.dark)
}
#endif
