#if canImport(UIKit)
import UIKit

struct LivelineLayout {
  let plot: CGRect
  let volume: CGRect?
  let x: ClosedRange<Double>
  let y: ClosedRange<Double>
  func toX(_ time: Double) -> CGFloat { plot.minX + (time - x.lowerBound) / max(1, x.upperBound - x.lowerBound) * plot.width }
  func toY(_ value: Double) -> CGFloat { plot.maxY - (value - y.lowerBound) / max(1e-20, y.upperBound - y.lowerBound) * plot.height }
  func time(_ position: CGFloat) -> Double {
    x.lowerBound + min(1, max(0, (position - plot.minX) / max(1, plot.width))) * (x.upperBound - x.lowerBound)
  }
}

extension LivelineColor {
  var uiColor: UIColor { UIColor(red: red, green: green, blue: blue, alpha: alpha) }
}

@MainActor
final class LivelineRenderer {
  var formatValue: (Double) -> String = { String(format: "%.2f", $0) }
  var formatVolume: (Double) -> String = { String(format: "%.0f", $0) }
  var formatTime: (Double) -> String = { Date(timeIntervalSince1970: $0).formatted(date: .abbreviated, time: .omitted) }
  private var gridStep = 0.0
  private var gridLabels: [String: (value: Double, alpha: Double)] = [:]
  private var timeLabels: [Double: Double] = [:]
  private var badgeWidth = 0.0
  private var badgeY: Double?
  private var arrowUp = 0.0
  private var arrowDown = 0.0
  private var identity: String?
  private var cachedPaths: [String: (points: [LivelinePoint], path: CGPath, bounds: CGRect)] = [:]
  private let labelFont = font(9)
  private let badgeFont = font(11, weight: .semibold)

  static func font(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
    let base = UIFont.systemFont(ofSize: size, weight: weight)
    return UIFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: size)
  }

  func layout(size: CGSize, engine: LivelineEngine) -> LivelineLayout {
    let volumeHeight: CGFloat = engine.input?.volume.contains(where: { $0.value > 0 }) == true ? 68 : 0
    let badgeSpace = engine.configuration.badge ? measure(formatValue(engine.displayedValue), font: badgeFont).width + 32 : 0
    let axisWidth = min(size.width * 0.4, max(56, badgeSpace, measure(formatValue(engine.yRange.upperBound), font: labelFont).width + 16))
    let right = engine.configuration.grid || engine.configuration.badge ? axisWidth : 12
    let bottom: CGFloat = engine.configuration.timeAxis ? 24 : 14
    let plot = CGRect(x: 8, y: 14, width: max(1, size.width - 8 - right), height: max(1, size.height - 14 - bottom - volumeHeight))
    let volume = volumeHeight > 0 ? CGRect(x: plot.minX, y: plot.maxY + 28, width: plot.width, height: 40) : nil
    return .init(plot: plot, volume: volume, x: engine.xRange, y: engine.yRange)
  }

  func draw(_ ctx: CGContext, size: CGSize, engine: LivelineEngine, frameMilliseconds dt: Double) {
    guard let input = engine.input else { return }
    if identity != input.id {
      identity = input.id; badgeY = nil; badgeWidth = 0
      gridStep = 0; gridLabels = [:]; timeLabels = [:]; cachedPaths = [:]
    }
    let layout = layout(size: size, engine: engine), cfg = engine.configuration
    let plot = layout.plot
    let reveal = engine.reveal
    cachedPaths = cachedPaths.filter { engine.splines[$0.key] != nil }
    ctx.saveGState()
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    ctx.clip(to: plot.insetBy(dx: -1, dy: -1))
    if reveal > 0 {
      if cfg.grid { drawGrid(ctx, layout: layout, engine: engine, dt: dt) }
      if let reference = cfg.referenceValue {
        line(ctx, from: CGPoint(x: plot.minX, y: layout.toY(reference)), to: CGPoint(x: plot.maxX, y: layout.toY(reference)), color: .white.withAlphaComponent(0.25 * reveal), dash: [3, 3])
      }
      if let projectionID = input.projectionID, let anchor = engine.splines[projectionID]?.points.first {
        let x = layout.toX(anchor.time)
        line(ctx, from: CGPoint(x: x, y: plot.minY), to: CGPoint(x: x, y: plot.maxY),
             color: .white.withAlphaComponent(0.22 * reveal), dash: [4, 4])
      }
      if let band = input.band, let upper = engine.splines[band.upper], let lower = engine.splines[band.lower] {
        let path = CGMutablePath()
        for (i, p) in upper.points.enumerated() {
          let point = CGPoint(x: layout.toX(p.time), y: layout.toY(p.value))
          if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        for p in lower.points.reversed() { path.addLine(to: CGPoint(x: layout.toX(p.time), y: layout.toY(p.value))) }
        path.closeSubpath(); ctx.addPath(path); ctx.setFillColor(UIColor.white.withAlphaComponent(0.05 * reveal).cgColor); ctx.fillPath()
      }
      for series in input.series {
        let alpha = (engine.alpha[series.id] ?? (series.visible ? 1 : 0))
        guard alpha > 0.001, let spline = engine.splines[series.id], spline.points.count >= 2 else { continue }
        let isPrimary = series.id == input.primaryID
        let path = curve(spline, id: series.id, multiplier: series.multiplier, layout: layout,
                         reveal: isPrimary ? reveal : 1, elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
        ctx.saveGState()
        let breath = loadingBreath(elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
        ctx.setAlpha(alpha * (isPrimary ? breath + (1 - breath) * reveal : reveal))
        if isPrimary && cfg.fill {
          let fill = path.mutableCopy()!
          fill.addLine(to: CGPoint(x: path.currentPoint.x, y: plot.maxY))
          fill.addLine(to: CGPoint(x: layout.toX(spline.points.first!.time), y: plot.maxY)); fill.closeSubpath()
          ctx.saveGState(); ctx.addPath(fill); ctx.clip()
          let colors = [series.color.uiColor.withAlphaComponent(0.12 * reveal).cgColor, series.color.uiColor.withAlphaComponent(0).cgColor]
          if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0, 1]) {
            ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: plot.minY), end: CGPoint(x: 0, y: plot.maxY), options: [])
          }
          ctx.restoreGState()
        }
        let stroke = isPrimary ? blend(.secondaryLabel, series.color.uiColor, fraction: min(1, reveal * 3)) : series.color.uiColor
        ctx.addPath(path); ctx.setStrokeColor(stroke.cgColor)
        ctx.setLineWidth(series.width); ctx.setLineCap(.round); ctx.setLineJoin(.round)
        ctx.setLineDash(phase: 0, lengths: series.dash.map { CGFloat($0) }); ctx.strokePath(); ctx.restoreGState()
      }
      if let p = engine.splines[input.primaryID]?.points.last, input.series.first(where: { $0.id == input.primaryID })?.visible == true {
        if cfg.currentPriceGuide {
          line(ctx, from: CGPoint(x: plot.minX, y: layout.toY(p.value)), to: CGPoint(x: plot.maxX, y: layout.toY(p.value)), color: .white.withAlphaComponent(0.2 * reveal), dash: [4, 4])
        }
      }
      drawHighlight(ctx, layout: layout, engine: engine)
    }
    let hasPrimaryCurve = (engine.splines[input.primaryID]?.points.count ?? 0) >= 2
    if !hasPrimaryCurve || reveal == 0 {
      let path = CGMutablePath()
      for i in 0...100 {
        let x = Double(i) / 100
        let y = LivelineMath.loadingY(x, milliseconds: cfg.reduceMotion ? 0 : engine.elapsed)
        let point = CGPoint(x: plot.minX + x * plot.width, y: plot.minY + y * plot.height)
        if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
      }
      ctx.saveGState()
      ctx.addPath(path); ctx.setLineWidth(input.series.first(where: { $0.id == input.primaryID })?.width ?? 2)
      ctx.setAlpha(loadingBreath(elapsed: cfg.reduceMotion ? 0 : engine.elapsed))
      ctx.setStrokeColor(UIColor.secondaryLabel.cgColor); ctx.strokePath()
      ctx.restoreGState()
    }
    if cfg.grid || cfg.badge {
      // Destination-out preserves the glass/background behind the chart.
      let colors = [UIColor.black.cgColor, UIColor.clear.cgColor] as CFArray
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
        ctx.saveGState(); ctx.setBlendMode(.destinationOut)
        ctx.drawLinearGradient(gradient, start: CGPoint(x: plot.minX, y: 0), end: CGPoint(x: plot.minX + min(40, plot.width * 0.12), y: 0), options: [.drawsBeforeStartLocation])
        ctx.restoreGState()
      }
    }
    ctx.endTransparencyLayer()
    ctx.restoreGState()
    if input.state == .empty || input.state == .placeholder {
      text(cfg.emptyText, at: CGPoint(x: plot.midX, y: plot.midY + 20), color: .secondaryLabel, alignment: .center)
    }
    if reveal > 0.1 {
      if cfg.timeAxis { drawTimeAxis(ctx, layout: layout, engine: engine, dt: dt) }
      if cfg.grid { drawGridLabels(layout: layout, engine: engine, opacity: reveal) }
      drawVolume(ctx, layout: layout, engine: engine)
      if cfg.extrema { drawExtrema(layout: layout, engine: engine) }
      drawEndpoint(ctx, layout: layout, engine: engine, dt: dt)
      drawCrosshair(ctx, layout: layout, engine: engine)
    }
  }

  func curve(_ spline: LivelineSpline, id: String, multiplier: Double, layout: LivelineLayout, reveal: Double, elapsed: Double) -> CGPath {
    let points = spline.points
    let origin = points.first!.time
    // Cache data-space Beziers. Viewport animation is a transform, not a per-point rebuild.
    let raw: CGPath, bounds: CGRect
    if let cached = cachedPaths[id], cached.points == points { raw = cached.path; bounds = cached.bounds }
    else {
      let path = CGMutablePath(); path.move(to: CGPoint(x: 0, y: points[0].value))
      for i in 0..<(points.count - 1) {
        let a = points[i], b = points[i + 1], h = b.time - a.time
        path.addCurve(to: CGPoint(x: b.time - origin, y: b.value),
                      control1: CGPoint(x: a.time - origin + h / 3, y: a.value + spline.tangents[i] * h / 3),
                      control2: CGPoint(x: b.time - origin - h / 3, y: b.value - spline.tangents[i + 1] * h / 3))
      }
      bounds = path.boundingBoxOfPath
      cachedPaths[id] = (points, path, bounds); raw = path
    }
    let minValue = min(Double(bounds.minY) * multiplier, Double(bounds.maxY) * multiplier)
    let maxValue = max(Double(bounds.minY) * multiplier, Double(bounds.maxY) * multiplier)
    if reveal >= 1, minValue >= layout.y.lowerBound, maxValue <= layout.y.upperBound {
      let sx = layout.plot.width / max(1, layout.x.upperBound - layout.x.lowerBound)
      let sy = -layout.plot.height / max(1e-20, layout.y.upperBound - layout.y.lowerBound)
      var transform = CGAffineTransform(a: sx, b: 0, c: 0, d: sy * multiplier,
                                       tx: layout.toX(origin), ty: layout.toY(0))
      return raw.copy(using: &transform)!
    }
    // Port the original screen-space spline morph, including the retracting tip.
    // The endpoint below reads this exact same geometry rather than the final data Y.
    var screen = points.map { p in
      let x = layout.toX(p.time)
      return LivelinePoint(time: Double(x), value: Double(revealedY(value: p.value * multiplier, x: x, layout: layout, reveal: reveal, elapsed: elapsed)))
    }
    let tip = endpoint(spline, multiplier: multiplier, layout: layout, reveal: reveal, elapsed: elapsed)
    if let last = screen.last, Double(tip.x) > last.time + 0.0001 {
      screen.append(.init(time: Double(tip.x), value: Double(tip.y)))
    }
    let morph = LivelineSpline(screen)
    let path = CGMutablePath(); path.move(to: CGPoint(x: screen[0].time, y: screen[0].value))
    for i in 0..<(screen.count - 1) {
      let a = screen[i], b = screen[i + 1], h = b.time - a.time
      path.addCurve(to: CGPoint(x: b.time, y: b.value),
                    control1: CGPoint(x: a.time + h / 3, y: a.value + morph.tangents[i] * h / 3),
                    control2: CGPoint(x: b.time - h / 3, y: b.value - morph.tangents[i + 1] * h / 3))
    }
    return path
  }

  func endpoint(_ spline: LivelineSpline, multiplier: Double = 1, layout: LivelineLayout, reveal: Double, elapsed: Double) -> CGPoint {
    guard let last = spline.points.last else { return CGPoint(x: layout.plot.maxX, y: layout.plot.midY) }
    let actualX = layout.toX(last.time)
    let x = actualX + max(0, layout.plot.maxX - actualX) * CGFloat(1 - reveal)
    return CGPoint(x: x, y: revealedY(value: last.value * multiplier, x: x, layout: layout, reveal: reveal, elapsed: elapsed))
  }

  private func revealedY(value: Double, x: CGFloat, layout: LivelineLayout, reveal: Double, elapsed: Double) -> CGFloat {
    let actual = min(layout.plot.maxY, max(layout.plot.minY, layout.toY(value)))
    guard reveal < 1 else { return actual }
    let fraction = Double(min(1, max(0, (x - layout.plot.minX) / layout.plot.width)))
    let local = min(1, max(0, (reveal - abs(fraction - 0.5) * 0.8) / 0.6))
    let loading = layout.plot.minY + CGFloat(LivelineMath.loadingY(fraction, milliseconds: elapsed)) * layout.plot.height
    return loading + (actual - loading) * CGFloat(local)
  }

  private func loadingBreath(elapsed: Double) -> Double { 0.22 + 0.08 * sin(elapsed / 1200 * .pi) }

  private func blend(_ from: UIColor, _ to: UIColor, fraction: Double) -> UIColor {
    var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
    var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
    from.getRed(&r1, green: &g1, blue: &b1, alpha: &a1); to.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    let t = CGFloat(min(1, max(0, fraction)))
    return UIColor(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, alpha: a1 + (a2 - a1) * t)
  }

  private func drawGrid(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double) {
    let span = layout.y.upperBound - layout.y.lowerBound
    gridStep = LivelineMath.gridInterval(range: span, height: layout.plot.height, previous: gridStep)
    let fine = gridStep / 2, pixels = fine / max(span, 1e-20) * layout.plot.height
    var targets: [String: (Double, Double)] = [:]
    let first = ceil(layout.y.lowerBound / fine)
    for offset in 0..<40 {
      let index = first + Double(offset), value = index * fine
      if value > layout.y.upperBound { break }
      let y = layout.toY(value)
      let edge = min(1, max(0, min(y - layout.plot.minY, layout.plot.maxY - y) / 32))
      let coarse = abs(value / gridStep - (value / gridStep).rounded()) < 0.01
      targets[String(format: "%.12g", value)] = (value, edge * (coarse ? 1 : min(1, max(0, (pixels - 40) / 20))))
    }
    for (key, entry) in targets where gridLabels[key] == nil { gridLabels[key] = (entry.0, 0) }
    for (key, entry) in gridLabels {
      let target = targets[key]?.1 ?? 0
      let opacity = engine.configuration.reduceMotion ? target : LivelineMath.lerp(entry.alpha, target, speed: target >= entry.alpha ? 0.18 : 0.12, milliseconds: dt)
      if opacity < 0.01 && target == 0 { gridLabels.removeValue(forKey: key); continue }
      gridLabels[key] = (entry.value, opacity)
      line(ctx, from: CGPoint(x: layout.plot.minX, y: layout.toY(entry.value)), to: CGPoint(x: layout.plot.maxX, y: layout.toY(entry.value)), color: .white.withAlphaComponent(opacity * 0.08 * engine.reveal), dash: [1, 3])
    }
  }
  private func drawGridLabels(layout: LivelineLayout, engine: LivelineEngine, opacity: Double) {
    for entry in gridLabels.values where entry.alpha > 0.02 {
      let y = layout.toY(entry.value)
      guard y >= layout.plot.minY, y <= layout.plot.maxY else { continue }
      if engine.configuration.badge, let input = engine.input,
         input.series.first(where: { $0.id == input.primaryID })?.visible == true,
         abs(Double(y) - (badgeY ?? Double(layout.toY(engine.displayedValue)))) < 18 { continue }
      text(formatValue(entry.value), at: CGPoint(x: layout.plot.maxX + 8, y: y), color: .secondaryLabel.withAlphaComponent(entry.alpha * opacity))
    }
  }
  private func drawTimeAxis(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double) {
    let duration = layout.x.upperBound - layout.x.lowerBound
    var interval = LivelineMath.niceTimeInterval(duration)
    while interval / max(1, duration) * layout.plot.width < 65 { interval *= 2 }
    var times: [Double] = []
    if interval >= 86400 && engine.configuration.profile == .aggr {
      var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
      var date = calendar.startOfDay(for: Date(timeIntervalSince1970: layout.x.lowerBound))
      let days = max(1, Int((interval / 86400).rounded()))
      while date.timeIntervalSince1970 <= layout.x.upperBound && times.count < 30 {
        times.append(date.timeIntervalSince1970)
        guard let next = calendar.date(byAdding: .day, value: days, to: date) else { break }; date = next
      }
    } else {
      let first = ceil(layout.x.lowerBound / interval) * interval
      times = (0..<30).map { first + Double($0) * interval }.filter { $0 <= layout.x.upperBound }
    }
    let targets = Set(times.filter { !formatTime($0).isEmpty })
    for t in targets where timeLabels[t] == nil { timeLabels[t] = 0 }
    for (t, alpha) in timeLabels {
      let x = layout.toX(t), edge = min(1, max(0, min(x - layout.plot.minX, layout.plot.maxX - x) / 50))
      let target = targets.contains(t) ? edge : 0
      let next = engine.configuration.reduceMotion ? target : LivelineMath.lerp(alpha, target, speed: 0.08, milliseconds: dt)
      if target == 0 && next < 0.01 { timeLabels.removeValue(forKey: t); continue }
      timeLabels[t] = next
      text(formatTime(t), at: CGPoint(x: x, y: layout.plot.maxY + 12), color: .secondaryLabel.withAlphaComponent(next * engine.reveal), alignment: .center)
    }
  }
  private func drawVolume(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine) {
    guard let pane = layout.volume, let input = engine.input else { return }
    let visible = input.volume.filter { layout.x.contains($0.time) }
    guard let maxValue = visible.map(\.value).max(), maxValue > 0 else { return }
    let spacing = visible.count > 1 ? layout.toX(visible[1].time) - layout.toX(visible[0].time) : 4
    ctx.saveGState(); ctx.clip(to: pane); ctx.setFillColor(UIColor.white.withAlphaComponent(0.25 * engine.reveal).cgColor)
    for p in visible {
      let h = max(0, p.value / maxValue * pane.height)
      ctx.fill(CGRect(x: layout.toX(p.time) - max(1, spacing * 0.6) / 2, y: pane.maxY - h, width: max(1, spacing * 0.6), height: h))
    }
    ctx.restoreGState()
    text(formatVolume(maxValue), at: CGPoint(x: pane.maxX + 8, y: pane.minY + 4), color: .secondaryLabel)
  }
  private func drawHighlight(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine) {
    guard let time = engine.inspectionTime, engine.configuration.highlight != .none else { return }
    var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(secondsFromGMT: 0)!
    let date = Date(timeIntervalSince1970: time), components = cal.dateComponents([.year, .month], from: date)
    let month = components.month ?? 1
    let startMonth = engine.configuration.highlight == .quarter ? ((month - 1) / 3) * 3 + 1 : month
    guard let start = cal.date(from: DateComponents(year: components.year, month: startMonth, day: 1)),
          let end = cal.date(byAdding: .month, value: engine.configuration.highlight == .quarter ? 3 : 1, to: start) else { return }
    let x1 = min(layout.plot.maxX, max(layout.plot.minX, layout.toX(start.timeIntervalSince1970)))
    let x2 = min(layout.plot.maxX, max(layout.plot.minX, layout.toX(end.timeIntervalSince1970)))
    ctx.setFillColor(UIColor.black.withAlphaComponent(0.55 * engine.scrubAmount).cgColor)
    ctx.fill(CGRect(x: layout.plot.minX, y: layout.plot.minY, width: x1 - layout.plot.minX, height: layout.plot.height))
    ctx.fill(CGRect(x: x2, y: layout.plot.minY, width: layout.plot.maxX - x2, height: layout.plot.height))
  }
  private func drawExtrema(layout: LivelineLayout, engine: LivelineEngine) {
    guard let input = engine.input, input.series.first(where: { $0.id == input.primaryID })?.visible == true,
          let pts = engine.splines[input.primaryID]?.points.filter({ layout.x.contains($0.time) }),
          let hi = pts.max(by: { $0.value < $1.value }), let lo = pts.min(by: { $0.value < $1.value }) else { return }
    for (p, offset) in [(hi, -12.0), (lo, 12.0)] {
      let label = formatValue(p.value), half = measure(label, font: labelFont).width / 2
      let x = min(layout.plot.maxX - half, max(layout.plot.minX + half, layout.toX(p.time)))
      text(label, at: CGPoint(x: x, y: layout.toY(p.value) + offset), color: .secondaryLabel.withAlphaComponent(engine.reveal * (1 - engine.scrubAmount)), alignment: .center)
    }
  }
  private func drawEndpoint(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double) {
    guard let input = engine.input, let series = input.series.first(where: { $0.id == input.primaryID }),
          let spline = engine.splines[input.primaryID], let last = spline.points.last else { return }
    let cfg = engine.configuration
    let visibility = engine.alpha[series.id] ?? (series.visible ? 1 : 0)
    guard visibility > 0.001 else { return }
    let tip = endpoint(spline, layout: layout, reveal: engine.reveal, elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
    let x = tip.x, y = tip.y
    let dim = engine.scrubAmount * 0.7
    let outer = UIColor(white: 40 / 255, alpha: 0.95)
    if cfg.dot && engine.reveal > 0.3 {
      ctx.saveGState(); ctx.setAlpha(visibility)
      if cfg.pulse && !cfg.reduceMotion && input.observation != nil && dim < 0.3 {
        let t = engine.elapsed.truncatingRemainder(dividingBy: 1500) / 900
        if t < 1 {
          let r = 9 + t * 12
          ctx.setStrokeColor(series.color.uiColor.withAlphaComponent(0.35 * (1 - t) * (1 - dim * 3)).cgColor)
          ctx.setLineWidth(1.5); ctx.strokeEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
        }
      }
      ctx.setShadow(offset: CGSize(width: 0, height: 1), blur: 6 * (1 - dim), color: UIColor.black.withAlphaComponent(0.3).cgColor)
      ctx.setFillColor(outer.cgColor)
      ctx.fillEllipse(in: CGRect(x: x - 6.5, y: y - 6.5, width: 13, height: 13))
      ctx.setShadow(offset: .zero, blur: 0)
      ctx.setFillColor(blend(series.color.uiColor, outer, fraction: dim).cgColor)
      ctx.fillEllipse(in: CGRect(x: x - 3.5, y: y - 3.5, width: 7, height: 7))
      ctx.restoreGState()
    }
    if cfg.badge {
      let label = formatValue(last.value), targetWidth = measure(label, font: badgeFont).width + 20
      badgeWidth = cfg.reduceMotion || badgeWidth == 0 ? targetWidth : LivelineMath.lerp(badgeWidth, targetWidth, speed: 0.15, milliseconds: dt)
      badgeY = cfg.reduceMotion || badgeY == nil ? y : LivelineMath.lerp(badgeY!, y, speed: 0.35, milliseconds: dt)
      let tail: CGFloat = cfg.badgeTail ? 5 : 0
      let pillWidth = CGFloat(badgeWidth), pillHeight: CGFloat = 22
      let path = Self.badgePath(width: pillWidth, height: pillHeight, tail: tail)
      ctx.saveGState(); ctx.setAlpha(engine.reveal * visibility)
      ctx.translateBy(x: layout.plot.maxX + 4, y: CGFloat(badgeY!) - pillHeight / 2)
      ctx.setShadow(offset: CGSize(width: 0, height: 1), blur: 4, color: UIColor.black.withAlphaComponent(0.25).cgColor)
      ctx.setFillColor((cfg.minimalBadge ? outer : series.color.uiColor).cgColor)
      ctx.addPath(path); ctx.fillPath(); ctx.setShadow(offset: .zero, blur: 0)
      text(label, at: CGPoint(x: tail + pillWidth / 2, y: pillHeight / 2),
           color: cfg.minimalBadge ? .white : .black, alignment: .center, font: badgeFont)
      ctx.restoreGState()
    }
    if cfg.momentum && !cfg.reduceMotion {
      let direction = LivelineMath.momentum(spline.points)
      arrowUp = LivelineMath.lerp(arrowUp, direction > 0 ? 1 : 0, speed: 0.12, milliseconds: dt)
      arrowDown = LivelineMath.lerp(arrowDown, direction < 0 ? 1 : 0, speed: 0.12, milliseconds: dt)
      for (amount, offset, sign, color) in [(arrowUp, -8.0, 1.0, UIColor.systemGreen), (arrowDown, 8.0, -1.0, UIColor.systemRed)] where amount > 0.01 {
        let baseline = y + CGFloat(offset), direction = CGFloat(sign)
        ctx.saveGState(); ctx.setAlpha(amount * visibility * engine.reveal)
        ctx.setStrokeColor(color.cgColor); ctx.setLineWidth(1.5); ctx.setLineCap(.round)
        ctx.move(to: CGPoint(x: x + 12, y: baseline + direction * 3))
        ctx.addLine(to: CGPoint(x: x + 16, y: baseline - direction))
        ctx.addLine(to: CGPoint(x: x + 20, y: baseline + direction * 3))
        ctx.strokePath(); ctx.restoreGState()
      }
    }
  }

  /// Curved tail and continuous capsule contour from the native Liveline port.
  static func badgePath(width: CGFloat, height: CGFloat, tail: CGFloat) -> CGPath {
    if tail == 0 { return CGPath(roundedRect: CGRect(x: 0, y: 0, width: width, height: height), cornerWidth: height / 2, cornerHeight: height / 2, transform: nil) }
    let path = CGMutablePath(), r = height / 2, right = tail + width - r, left = tail + r
    path.move(to: CGPoint(x: left, y: 0)); path.addLine(to: CGPoint(x: right, y: 0))
    path.addArc(center: CGPoint(x: right, y: r), radius: r, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false)
    path.addLine(to: CGPoint(x: left, y: height))
    path.addCurve(to: CGPoint(x: 0, y: r), control1: CGPoint(x: tail + 2, y: height), control2: CGPoint(x: 3, y: r + 2.5))
    path.addCurve(to: CGPoint(x: left, y: 0), control1: CGPoint(x: 3, y: r - 2.5), control2: CGPoint(x: tail + 2, y: 0))
    path.closeSubpath()
    return path
  }
  private func drawCrosshair(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine) {
    guard let time = engine.inspectionTime, let selection = engine.selection(at: time) else { return }
    let x = layout.toX(time), y = min(layout.plot.maxY, max(layout.plot.minY, layout.toY(selection.value)))
    let color = UIColor.white.withAlphaComponent(0.68 * engine.scrubAmount)
    line(ctx, from: CGPoint(x: x, y: layout.plot.minY), to: CGPoint(x: x, y: layout.volume?.maxY ?? layout.plot.maxY), color: color, dash: [4, 4])
    line(ctx, from: CGPoint(x: layout.plot.minX, y: y), to: CGPoint(x: layout.plot.maxX, y: y), color: color, dash: [4, 4])
    if engine.configuration.dimAfterScrub {
      ctx.setFillColor(UIColor.black.withAlphaComponent(0.35 * engine.scrubAmount).cgColor)
      ctx.fill(CGRect(x: x, y: layout.plot.minY, width: max(0, layout.plot.maxX - x), height: layout.plot.height))
    }
    let radius = CGFloat(4 * min(1, engine.scrubAmount * 3))
    ctx.setFillColor(UIColor.white.cgColor); ctx.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
  }
  private func line(_ ctx: CGContext, from: CGPoint, to: CGPoint, color: UIColor, dash: [CGFloat] = []) {
    ctx.saveGState(); ctx.setStrokeColor(color.cgColor); ctx.setLineWidth(1); ctx.setLineDash(phase: 0, lengths: dash)
    ctx.move(to: from); ctx.addLine(to: to); ctx.strokePath(); ctx.restoreGState()
  }
  private enum Alignment { case leading, center }
  private func measure(_ string: String, font: UIFont) -> CGSize { (string as NSString).size(withAttributes: [.font: font]) }
  private func text(_ string: String, at point: CGPoint, color: UIColor, alignment: Alignment = .leading, font: UIFont? = nil) {
    let font = font ?? labelFont, size = measure(string, font: font)
    (string as NSString).draw(at: CGPoint(x: point.x - (alignment == .center ? size.width / 2 : 0), y: point.y - size.height / 2), withAttributes: [.font: font, .foregroundColor: color])
  }
}
#endif
