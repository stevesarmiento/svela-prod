#if canImport(UIKit)
import CoreText
import UIKit

struct LivelineLayout: Equatable {
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

/// Screen-space curve geometry: a cached (possibly shared) history path plus the few trailing
/// segments that move with the animated endpoint. Adding it to a context never copies the history.
struct LivelineCurveGeometry {
  struct Segment { let to: CGPoint, control1: CGPoint, control2: CGPoint }
  let history: CGPath
  let tail: [Segment]
  let end: CGPoint
  func add(to ctx: CGContext) {
    ctx.addPath(history)
    for segment in tail { ctx.addCurve(to: segment.to, control1: segment.control1, control2: segment.control2) }
  }
  var path: CGPath {
    let path = CGMutablePath()
    path.addPath(history)
    for segment in tail { path.addCurve(to: segment.to, control1: segment.control1, control2: segment.control2) }
    return path
  }
}

@MainActor
final class LivelineRenderer {
  var formatValue: (Double) -> String = { String(format: "%.2f", $0) }
  var formatVolume: (Double) -> String = { String(format: "%.0f", $0) }
  var formatTime: (Double) -> String = { Date(timeIntervalSince1970: $0).formatted(date: .abbreviated, time: .omitted) }

  private static let colorSpace = CGColorSpaceCreateDeviceRGB()
  private static let utcCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar
  }()
  /// Destination-out left fade; its colors never change.
  private static let fadeGradient = CGGradient(colorsSpace: colorSpace,
                                               colors: [UIColor.black.cgColor, UIColor.clear.cgColor] as CFArray, locations: [0, 1])
  private static let whiteColor = UIColor.white.cgColor
  private static let blackColor = UIColor.black.cgColor
  private static let dotOuterColor = UIColor(white: 40 / 255, alpha: 0.95)
  private static let dotShadowColor = UIColor.black.withAlphaComponent(0.3).cgColor
  private static let badgeShadowColor = UIColor.black.withAlphaComponent(0.25).cgColor

  // Grid
  /// Keyed by the rounded value (not the interval): a line that exists under both the old and
  /// new grid step keeps its entry across a step change instead of crossfading with itself.
  private struct GridKey: Hashable { let value: UInt64 }
  private var gridStep = 0.0
  private var gridLabels: [GridKey: (value: Double, alpha: Double, label: String)] = [:]
  // Time axis
  private var timeLabels: [Double: Double] = [:]
  private var timeLabelText: [Double: String] = [:]
  // Badge / momentum
  private var badgeWidth = 0.0
  private var badgeY: Double?
  private var arrowUp = 0.0
  private var arrowDown = 0.0
  private var identity: String?
  private var prunedRevision: Int?

  // Curve geometry caches. `revision` keys the engine path; tests without an engine fall back to
  // comparing the point array.
  private struct DataPath {
    let revision: Int?, points: [LivelinePoint]?, count: Int, historyCount: Int
    let origin: Double, path: CGPath, bounds: CGRect
  }
  private var dataPaths: [String: DataPath] = [:]
  private struct ScreenPath {
    let revision: Int?, points: [LivelinePoint]?, count: Int, historyCount: Int
    let plot: CGRect, x: ClosedRange<Double>, y: ClosedRange<Double>, multiplier: Double
    let path: CGPath
  }
  private var screenPaths: [String: ScreenPath] = [:]

  // Per-color resources
  private var cgColors: [LivelineColor: CGColor] = [:]
  private var fillGradients: [LivelineColor: CGGradient] = [:]
  private struct ShadowImageKey: Hashable { let kind: UInt8, width: Int, blur: Int, color: LivelineColor?, scale: CGFloat }
  private var shadowImages: [ShadowImageKey: (image: CGImage, size: CGSize, inset: CGFloat)] = [:]

  // Per-frame text
  private var displayedLabel: (value: Double, text: String)?
  private var upperLabel: (value: Double, text: String)?
  private var extremaLabels: [Double: (label: String, half: CGFloat)] = [:]

  // Layout memo
  private struct LayoutKey: Equatable {
    let size: CGSize, configuration: LivelineConfiguration, x: ClosedRange<Double>, y: ClosedRange<Double>
    let displayed: Double, revision: Int, hasInput: Bool
  }
  private var layoutKey: LayoutKey?
  private var cachedLayout: LivelineLayout?
  private var inputFacts: (revision: Int, hasVolume: Bool, maxWidth: Double)?

  // Volume / extrema memo
  private struct VolumeKey: Equatable { let revision: Int, x: ClosedRange<Double>, pane: CGRect }
  private var volumeKey: VolumeKey?
  private var volumeBars: (visible: [LivelinePoint], maxValue: Double, spacing: CGFloat, label: String)?
  private struct ExtremaKey: Equatable { let revision: Int, x: ClosedRange<Double>, appended: Bool }
  private var extremaKey: ExtremaKey?
  private var extremaBase: (hi: LivelinePoint?, lo: LivelinePoint?) = (nil, nil)

  /// Live-dot pulses wanted this frame; the view mirrors them onto CAShapeLayers
  /// so the ring keeps pulsing while the display link is stopped.
  private(set) var pulses: [LivelinePulse] = []
  #if DEBUG
  private(set) var screenPathBuildCount = 0
  private(set) var dataPathBuildCount = 0
  #endif
  private let labelFont = font(9)
  private let badgeFont = font(11, weight: .semibold)

  static func font(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
    let base = UIFont.systemFont(ofSize: size, weight: weight)
    return UIFont(descriptor: base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor, size: size)
  }

  // MARK: Layout

  private func label(for value: Double, memo: inout (value: Double, text: String)?) -> String {
    if let memo, memo.value == value { return memo.text }
    let text = formatValue(value)
    memo = (value, text)
    return text
  }

  func layout(size: CGSize, engine: LivelineEngine) -> LivelineLayout {
    let key = LayoutKey(size: size, configuration: engine.configuration, x: engine.xRange, y: engine.yRange,
                        displayed: engine.displayedValue, revision: engine.revision, hasInput: engine.input != nil)
    if key == layoutKey, let cachedLayout { return cachedLayout }
    if inputFacts?.revision != engine.revision || inputFacts == nil {
      inputFacts = (engine.revision, engine.input?.volume.contains(where: { $0.value > 0 }) == true,
                    engine.input?.series.map(\.width).max() ?? 2)
    }
    let facts = inputFacts!
    let layout: LivelineLayout
    if engine.configuration.compact {
      // Leave room for round stroke caps without spending the tiny plot on axes.
      let inset = max(1, facts.maxWidth / 2)
      let plot = CGRect(x: inset, y: inset, width: max(1, size.width - inset * 2),
                        height: max(1, size.height - inset * 2))
      layout = .init(plot: plot, volume: nil, x: engine.xRange, y: engine.yRange)
    } else {
      let volumeHeight: CGFloat = facts.hasVolume ? 68 : 0
      let badgeSpace = engine.configuration.badge ? measure(label(for: engine.displayedValue, memo: &displayedLabel), font: badgeFont).width + 32 : 0
      let axisWidth = min(size.width * 0.4, max(56, badgeSpace, measure(label(for: engine.yRange.upperBound, memo: &upperLabel), font: labelFont).width + 16))
      let right = !engine.configuration.seriesLabels.isEmpty ? 12
        : engine.configuration.grid || engine.configuration.badge ? axisWidth : 12
      let bottom: CGFloat = engine.configuration.timeAxis ? 24 : 14
      let plot = CGRect(x: 8, y: 14, width: max(1, size.width - 8 - right), height: max(1, size.height - 14 - bottom - volumeHeight))
      let volume = volumeHeight > 0 ? CGRect(x: plot.minX, y: plot.maxY + 28, width: plot.width, height: 40) : nil
      layout = .init(plot: plot, volume: volume, x: engine.xRange, y: engine.yRange)
    }
    layoutKey = key; cachedLayout = layout
    return layout
  }

  // MARK: Frame

  /// Draws one frame. `transparencyLayer` is only needed when the context already holds content the
  /// destination-out left fade must not erase; the view's own cleared bitmap passes `false`.
  func draw(_ ctx: CGContext, size: CGSize, engine: LivelineEngine, frameMilliseconds dt: Double,
            drawsSeries: Bool = true, transparencyLayer: Bool = true) {
    guard let input = engine.input else { return }
    if identity != input.id {
      identity = input.id; badgeY = nil; badgeWidth = 0
      gridStep = 0; gridLabels = [:]; timeLabels = [:]; timeLabelText = [:]
      dataPaths = [:]; screenPaths = [:]
      displayedLabel = nil; upperLabel = nil; extremaLabels = [:]
      layoutKey = nil; volumeKey = nil; extremaKey = nil
    }
    let layout = layout(size: size, engine: engine), cfg = engine.configuration
    let plot = layout.plot
    let reveal = engine.reveal
    pulses = []
    if prunedRevision != engine.revision {
      prunedRevision = engine.revision
      dataPaths = dataPaths.filter { engine.splines[$0.key] != nil }
      screenPaths = screenPaths.filter { engine.splines[$0.key] != nil }
    }
    let secondary = UIColor.secondaryLabel.cgColor
    let fades = cfg.grid || cfg.badge
    let isolate = fades && transparencyLayer
    ctx.saveGState()
    if isolate { ctx.beginTransparencyLayer(auxiliaryInfo: nil) }
    ctx.clip(to: plot.insetBy(dx: -1, dy: -1))
    if reveal > 0 {
      if cfg.grid { drawGrid(ctx, layout: layout, engine: engine, dt: dt) }
      if let reference = cfg.referenceValue {
        line(ctx, from: CGPoint(x: plot.minX, y: layout.toY(reference)), to: CGPoint(x: plot.maxX, y: layout.toY(reference)),
             color: Self.whiteColor, alpha: 0.25 * reveal, dash: [3, 3])
      }
      if let projectionID = input.projectionID, let anchor = engine.splines[projectionID]?.points.first {
        let x = layout.toX(anchor.time)
        line(ctx, from: CGPoint(x: x, y: plot.minY), to: CGPoint(x: x, y: plot.maxY),
             color: Self.whiteColor, alpha: 0.22 * reveal, dash: [4, 4])
      }
      if let band = input.band, let upper = engine.splines[band.upper], let lower = engine.splines[band.lower] {
        ctx.saveGState()
        for (i, p) in upper.points.enumerated() {
          let point = CGPoint(x: layout.toX(p.time), y: layout.toY(p.value))
          if i == 0 { ctx.move(to: point) } else { ctx.addLine(to: point) }
        }
        for p in lower.points.reversed() { ctx.addLine(to: CGPoint(x: layout.toX(p.time), y: layout.toY(p.value))) }
        ctx.closePath(); ctx.setFillColor(Self.whiteColor); ctx.setAlpha(0.05 * reveal); ctx.fillPath()
        ctx.restoreGState()
      }
      for series in drawsSeries ? input.series : [] {
        let alpha = (engine.alpha[series.id] ?? series.targetOpacity)
        guard alpha > 0.001, let spline = engine.splines[series.id], spline.points.count >= 2 else { continue }
        let isPrimary = series.id == input.primaryID
        let geometry = geometry(spline, id: series.id, multiplier: series.multiplier, layout: layout,
                                reveal: isPrimary ? reveal : 1, elapsed: cfg.reduceMotion ? 0 : engine.elapsed,
                                revision: engine.revision, animatedTail: isPrimary ? LivelineSpline.patchedTail : 0)
        ctx.saveGState()
        let breath = loadingBreath(elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
        let baseAlpha = alpha * (isPrimary ? breath + (1 - breath) * reveal : reveal)
        ctx.setAlpha(baseAlpha)
        if isPrimary && cfg.fill {
          ctx.saveGState()
          geometry.add(to: ctx)
          let endX = ctx.currentPointOfPath.x
          ctx.addLine(to: CGPoint(x: endX, y: plot.maxY))
          ctx.addLine(to: CGPoint(x: layout.toX(spline.points.first!.time), y: plot.maxY)); ctx.closePath()
          ctx.clip()
          // The gradient itself is fixed per color; the reveal fade rides on the context alpha.
          ctx.setAlpha(baseAlpha * reveal)
          ctx.drawLinearGradient(fillGradient(for: series.color), start: CGPoint(x: 0, y: plot.minY), end: CGPoint(x: 0, y: plot.maxY), options: [])
          ctx.restoreGState()
        }
        let stroke = isPrimary && reveal < 1 / 3
          ? blend(.secondaryLabel, series.color.uiColor, fraction: min(1, reveal * 3)).cgColor : cgColor(series.color)
        func strokeCurve() {
          geometry.add(to: ctx); ctx.setStrokeColor(stroke)
          ctx.setLineWidth(series.width); ctx.setLineCap(.round); ctx.setLineJoin(.round)
          ctx.setLineDash(phase: 0, lengths: series.dash.map { CGFloat($0) }); ctx.strokePath()
        }
        // While scrubbing, every line right of the finger dims so the inspected past reads as
        // "now ends here" (wallet Liveline behavior); comparison charts dim all their series.
        if cfg.scrub, engine.scrubAmount > 0.01, let inspection = engine.inspectionTime {
          let scrubX = layout.toX(inspection)
          ctx.saveGState()
          ctx.clip(to: CGRect(x: plot.minX - 2, y: 0, width: max(0, scrubX - (plot.minX - 2)), height: size.height))
          strokeCurve()
          ctx.restoreGState()
          ctx.saveGState()
          ctx.clip(to: CGRect(x: scrubX, y: 0, width: max(0, size.width - scrubX), height: size.height))
          ctx.setAlpha(baseAlpha * (1 - engine.scrubAmount * 0.6))
          strokeCurve()
          ctx.restoreGState()
        } else {
          strokeCurve()
        }
        ctx.restoreGState()
      }
      if let p = engine.splines[input.primaryID]?.points.last, input.series.first(where: { $0.id == input.primaryID })?.visible == true {
        if cfg.currentPriceGuide {
          line(ctx, from: CGPoint(x: plot.minX, y: layout.toY(p.value)), to: CGPoint(x: plot.maxX, y: layout.toY(p.value)),
               color: Self.whiteColor, alpha: 0.2 * reveal, dash: [4, 4])
        }
      }
      drawHighlight(ctx, layout: layout, engine: engine)
    }
    let hasPrimaryCurve = (engine.splines[input.primaryID]?.points.count ?? 0) >= 2
    if !hasPrimaryCurve || reveal == 0 {
      ctx.saveGState()
      for i in 0...100 {
        let x = Double(i) / 100
        let y = LivelineMath.loadingY(x, milliseconds: cfg.reduceMotion ? 0 : engine.elapsed)
        let point = CGPoint(x: plot.minX + x * plot.width, y: plot.minY + y * plot.height)
        if i == 0 { ctx.move(to: point) } else { ctx.addLine(to: point) }
      }
      ctx.setLineWidth(input.series.first(where: { $0.id == input.primaryID })?.width ?? 2)
      ctx.setAlpha(loadingBreath(elapsed: cfg.reduceMotion ? 0 : engine.elapsed))
      ctx.setStrokeColor(secondary); ctx.strokePath()
      ctx.restoreGState()
    }
    if fades, let gradient = Self.fadeGradient {
      // Destination-out preserves the glass/background behind the chart.
      let bandEnd = plot.minX + min(40, plot.width * 0.12)
      ctx.saveGState(); ctx.setBlendMode(.destinationOut)
      // Only the band left of `bandEnd` changes; clipping keeps the shader off the rest of the plot.
      ctx.clip(to: CGRect(x: 0, y: 0, width: bandEnd, height: size.height))
      ctx.drawLinearGradient(gradient, start: CGPoint(x: plot.minX, y: 0), end: CGPoint(x: bandEnd, y: 0), options: [.drawsBeforeStartLocation])
      ctx.restoreGState()
    }
    if isolate { ctx.endTransparencyLayer() }
    ctx.restoreGState()
    if input.state == .empty || input.state == .placeholder {
      text(cfg.emptyText, at: CGPoint(x: plot.midX, y: plot.midY + 20), color: secondary, alignment: .center)
    }
    if reveal > 0.1 {
      if cfg.timeAxis { drawTimeAxis(ctx, layout: layout, engine: engine, dt: dt, secondary: secondary) }
      if cfg.grid && cfg.seriesLabels.isEmpty { drawGridLabels(layout: layout, engine: engine, opacity: reveal, secondary: secondary) }
      drawVolume(ctx, layout: layout, engine: engine, secondary: secondary)
      if cfg.extrema { drawExtrema(layout: layout, engine: engine, secondary: secondary) }
      drawEndpoint(ctx, layout: layout, engine: engine, dt: dt)
      drawCrosshair(ctx, layout: layout, engine: engine)
    }
  }

  // MARK: Curve geometry

  func curve(_ spline: LivelineSpline, id: String, multiplier: Double, layout: LivelineLayout, reveal: Double, elapsed: Double,
             revision: Int? = nil, animatedTail: Int = 0) -> CGPath {
    geometry(spline, id: id, multiplier: multiplier, layout: layout, reveal: reveal, elapsed: elapsed,
             revision: revision, animatedTail: animatedTail).path
  }

  /// The history (all points before the last `animatedTail` segments) is cached in data space and
  /// in screen space; only the tail is rebuilt per frame while the endpoint animates.
  func geometry(_ spline: LivelineSpline, id: String, multiplier: Double, layout: LivelineLayout, reveal: Double, elapsed: Double,
                revision: Int? = nil, animatedTail: Int = 0) -> LivelineCurveGeometry {
    let points = spline.points, n = points.count
    let tailSegments = max(0, min(animatedTail, n - 1))
    let historyCount = n - tailSegments
    func matches(_ cachedRevision: Int?, _ cachedPoints: [LivelinePoint]?, _ count: Int, _ history: Int) -> Bool {
      guard count == n, history == historyCount else { return false }
      if let revision { return cachedRevision == revision }
      return cachedPoints == points
    }
    func tail(_ screenPoint: (LivelinePoint) -> CGPoint, _ screenValue: (Double) -> CGFloat) -> [LivelineCurveGeometry.Segment] {
      guard tailSegments > 0 else { return [] }
      return (historyCount - 1..<n - 1).map { i in
        let a = points[i], b = points[i + 1], h = b.time - a.time
        return .init(to: screenPoint(b),
                     control1: CGPoint(x: layout.toX(a.time + h / 3), y: screenValue(a.value + spline.tangents[i] * h / 3)),
                     control2: CGPoint(x: layout.toX(b.time - h / 3), y: screenValue(b.value - spline.tangents[i + 1] * h / 3)))
      }
    }
    let screenPoint: (LivelinePoint) -> CGPoint = { CGPoint(x: layout.toX($0.time), y: layout.toY($0.value * multiplier)) }
    let screenValue: (Double) -> CGFloat = { layout.toY($0 * multiplier) }
    // During selection, only alpha changes. Reuse the final screen geometry
    // instead of copying every curve through a transform on every fade frame.
    if reveal >= 1, let cached = screenPaths[id], matches(cached.revision, cached.points, cached.count, cached.historyCount),
       cached.plot == layout.plot, cached.x == layout.x, cached.y == layout.y, cached.multiplier == multiplier {
      // The cached history fit the y range when built; only the animated tail can have left it since.
      let segments = tail(screenPoint, screenValue)
      let inside = segments.allSatisfy { $0.to.y >= layout.plot.minY - 1e-6 && $0.to.y <= layout.plot.maxY + 1e-6 }
      if inside { return .init(history: cached.path, tail: segments, end: screenPoint(points[n - 1])) }
    }
    let origin = points.first!.time
    // Cache data-space Beziers. Viewport animation is a transform, not a per-point rebuild.
    let raw: CGPath, historyBounds: CGRect
    if let cached = dataPaths[id], matches(cached.revision, cached.points, cached.count, cached.historyCount) {
      raw = cached.path; historyBounds = cached.bounds
    } else {
      let path = CGMutablePath(); path.move(to: CGPoint(x: 0, y: points[0].value))
      for i in 0..<(historyCount - 1) {
        let a = points[i], b = points[i + 1], h = b.time - a.time
        path.addCurve(to: CGPoint(x: b.time - origin, y: b.value),
                      control1: CGPoint(x: a.time - origin + h / 3, y: a.value + spline.tangents[i] * h / 3),
                      control2: CGPoint(x: b.time - origin - h / 3, y: b.value - spline.tangents[i + 1] * h / 3))
      }
      historyBounds = historyCount > 1 ? path.boundingBoxOfPath : CGRect(x: 0, y: points[0].value, width: 0, height: 0)
      dataPaths[id] = .init(revision: revision, points: revision == nil ? points : nil, count: n, historyCount: historyCount,
                            origin: origin, path: path, bounds: historyBounds)
      raw = path
      #if DEBUG
      dataPathBuildCount += 1
      #endif
    }
    var bounds = historyBounds
    if tailSegments > 0 {
      let tailPath = CGMutablePath()
      tailPath.move(to: CGPoint(x: points[historyCount - 1].time - origin, y: points[historyCount - 1].value))
      for i in (historyCount - 1)..<(n - 1) {
        let a = points[i], b = points[i + 1], h = b.time - a.time
        tailPath.addCurve(to: CGPoint(x: b.time - origin, y: b.value),
                          control1: CGPoint(x: a.time - origin + h / 3, y: a.value + spline.tangents[i] * h / 3),
                          control2: CGPoint(x: b.time - origin - h / 3, y: b.value - spline.tangents[i + 1] * h / 3))
      }
      bounds = bounds.union(tailPath.boundingBoxOfPath)
    }
    let minValue = min(Double(bounds.minY) * multiplier, Double(bounds.maxY) * multiplier)
    let maxValue = max(Double(bounds.minY) * multiplier, Double(bounds.maxY) * multiplier)
    if reveal >= 1, minValue >= layout.y.lowerBound, maxValue <= layout.y.upperBound {
      let sx = layout.plot.width / max(1, layout.x.upperBound - layout.x.lowerBound)
      let sy = -layout.plot.height / max(1e-20, layout.y.upperBound - layout.y.lowerBound)
      var transform = CGAffineTransform(a: sx, b: 0, c: 0, d: sy * multiplier,
                                       tx: layout.toX(origin), ty: layout.toY(0))
      let history = raw.copy(using: &transform)!
      screenPaths[id] = ScreenPath(revision: revision, points: revision == nil ? points : nil, count: n, historyCount: historyCount,
                                   plot: layout.plot, x: layout.x, y: layout.y, multiplier: multiplier, path: history)
      #if DEBUG
      screenPathBuildCount += 1
      #endif
      return .init(history: history, tail: tail(screenPoint, screenValue), end: screenPoint(points[n - 1]))
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
    return .init(history: path, tail: [], end: CGPoint(x: screen[screen.count - 1].time, y: screen[screen.count - 1].value))
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

  // MARK: Cached per-color resources

  private func cgColor(_ color: LivelineColor) -> CGColor {
    if let hit = cgColors[color] { return hit }
    let resolved = color.uiColor.cgColor
    if cgColors.count > 64 { cgColors.removeAll(keepingCapacity: true) }
    cgColors[color] = resolved
    return resolved
  }

  private func fillGradient(for color: LivelineColor) -> CGGradient {
    if let hit = fillGradients[color] { return hit }
    let colors = [color.uiColor.withAlphaComponent(0.12).cgColor, color.uiColor.withAlphaComponent(0).cgColor]
    let gradient = CGGradient(colorsSpace: Self.colorSpace, colors: colors as CFArray, locations: [0, 1])!
    if fillGradients.count > 16 { fillGradients.removeAll(keepingCapacity: true) }
    fillGradients[color] = gradient
    return gradient
  }

  /// Pre-renders a shadowed shape once (shadows force an offscreen blur pass per draw) using the
  /// same flipped user space as the chart bitmap, so the cached image composites pixel-for-pixel.
  private func shadowImage(key: ShadowImageKey, size: CGSize, blur: CGFloat, offset: CGSize, shadow: CGColor,
                           draw: (CGContext) -> Void) -> (image: CGImage, size: CGSize, inset: CGFloat)? {
    if let hit = shadowImages[key] { return hit }
    let inset = ceil(blur * 2 + max(abs(offset.width), abs(offset.height)) + 1)
    let full = CGSize(width: size.width + inset * 2, height: size.height + inset * 2)
    let scale = max(1, key.scale)
    guard let ctx = CGContext(data: nil, width: Int(ceil(full.width * scale)), height: Int(ceil(full.height * scale)),
                              bitsPerComponent: 8, bytesPerRow: 0, space: Self.colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: 0, y: full.height); ctx.scaleBy(x: 1, y: -1)
    ctx.translateBy(x: inset, y: inset)
    ctx.setShadow(offset: offset, blur: blur, color: shadow)
    draw(ctx)
    guard let image = ctx.makeImage() else { return nil }
    if shadowImages.count > 48 { shadowImages.removeAll(keepingCapacity: true) }
    let entry = (image, full, inset)
    shadowImages[key] = entry
    return entry
  }

  /// Draws a cached bitmap with its top-left at `origin` in the chart's flipped user space.
  private func drawImage(_ image: CGImage, size: CGSize, topLeft origin: CGPoint, in ctx: CGContext) {
    ctx.saveGState()
    ctx.translateBy(x: origin.x, y: origin.y + size.height)
    ctx.scaleBy(x: 1, y: -1)
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(origin: .zero, size: size))
    ctx.restoreGState()
  }

  private func deviceScale(_ ctx: CGContext) -> CGFloat {
    let ctm = ctx.ctm
    return max(1, (sqrt(ctm.a * ctm.a + ctm.c * ctm.c) * 4).rounded() / 4)
  }

  // MARK: Grid

  private func drawGrid(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double) {
    let span = layout.y.upperBound - layout.y.lowerBound
    gridStep = LivelineMath.gridInterval(range: span, height: layout.plot.height, previous: gridStep)
    let fine = gridStep / 2, pixels = fine / max(span, 1e-20) * layout.plot.height
    var targets: [GridKey: (Double, Double)] = [:]
    let first = ceil(layout.y.lowerBound / fine)
    for offset in 0..<40 {
      let index = first + Double(offset), value = index * fine
      if value > layout.y.upperBound { break }
      guard index.isFinite, abs(index) < 1e15 else { break }
      let y = layout.toY(value)
      let edge = min(1, max(0, min(y - layout.plot.minY, layout.plot.maxY - y) / 32))
      let coarse = abs(value / gridStep - (value / gridStep).rounded()) < 0.01
      targets[GridKey(value: (Double(String(format: "%.12g", value)) ?? value).bitPattern)] = (value, edge * (coarse ? 1 : min(1, max(0, (pixels - 40) / 20))))
    }
    for (key, entry) in targets where gridLabels[key] == nil { gridLabels[key] = (entry.0, 0, formatValue(entry.0)) }
    for (key, entry) in gridLabels {
      let target = targets[key]?.1 ?? 0
      let opacity = engine.configuration.reduceMotion ? target : LivelineMath.lerp(entry.alpha, target, speed: target >= entry.alpha ? 0.18 : 0.12, milliseconds: dt)
      if opacity < 0.01 && target == 0 { gridLabels.removeValue(forKey: key); continue }
      gridLabels[key] = (entry.value, opacity, entry.label)
      line(ctx, from: CGPoint(x: layout.plot.minX, y: layout.toY(entry.value)), to: CGPoint(x: layout.plot.maxX, y: layout.toY(entry.value)),
           color: Self.whiteColor, alpha: opacity * 0.08 * engine.reveal, dash: [1, 3])
    }
  }
  private func drawGridLabels(layout: LivelineLayout, engine: LivelineEngine, opacity: Double, secondary: CGColor) {
    for entry in gridLabels.values where entry.alpha > 0.02 {
      let y = layout.toY(entry.value)
      guard y >= layout.plot.minY, y <= layout.plot.maxY else { continue }
      if engine.configuration.badge, let input = engine.input,
         input.series.first(where: { $0.id == input.primaryID })?.visible == true,
         abs(Double(y) - (badgeY ?? Double(layout.toY(engine.displayedValue)))) < 18 { continue }
      text(entry.label, at: CGPoint(x: layout.plot.maxX + 8, y: y), color: secondary, alpha: entry.alpha * opacity)
    }
  }

  // MARK: Time axis

  private func timeLabel(_ time: Double) -> String {
    if let hit = timeLabelText[time] { return hit }
    let label = formatTime(time)
    if timeLabelText.count > 512 { timeLabelText = timeLabelText.filter { timeLabels[$0.key] != nil } }
    timeLabelText[time] = label
    return label
  }
  private func drawTimeAxis(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double, secondary: CGColor) {
    let duration = layout.x.upperBound - layout.x.lowerBound
    var interval = LivelineMath.niceTimeInterval(duration)
    while interval / max(1, duration) * layout.plot.width < 65 { interval *= 2 }
    var times: [Double] = []
    if interval >= 86400 && engine.configuration.profile == .aggr {
      let calendar = Self.utcCalendar
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
    let targets = Set(times.filter { !timeLabel($0).isEmpty })
    for t in targets where timeLabels[t] == nil { timeLabels[t] = 0 }
    for (t, alpha) in timeLabels {
      let x = layout.toX(t), edge = min(1, max(0, min(x - layout.plot.minX, layout.plot.maxX - x) / 50))
      let target = targets.contains(t) ? edge : 0
      let next = engine.configuration.reduceMotion ? target : LivelineMath.lerp(alpha, target, speed: 0.08, milliseconds: dt)
      if target == 0 && next < 0.01 { timeLabels.removeValue(forKey: t); continue }
      timeLabels[t] = next
      text(timeLabel(t), at: CGPoint(x: x, y: layout.plot.maxY + 12), color: secondary, alpha: next * engine.reveal, alignment: .center)
    }
  }

  // MARK: Volume / highlight / extrema

  private func drawVolume(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, secondary: CGColor) {
    guard let pane = layout.volume, let input = engine.input else { return }
    let key = VolumeKey(revision: engine.revision, x: layout.x, pane: pane)
    if key != volumeKey {
      volumeKey = key
      let visible = input.volume.filter { layout.x.contains($0.time) }
      if let maxValue = visible.map(\.value).max(), maxValue > 0 {
        let spacing = visible.count > 1 ? layout.toX(visible[1].time) - layout.toX(visible[0].time) : 4
        volumeBars = (visible, maxValue, spacing, formatVolume(maxValue))
      } else { volumeBars = nil }
    }
    guard let bars = volumeBars else { return }
    let width = max(1, bars.spacing * 0.6)
    ctx.saveGState(); ctx.clip(to: pane); ctx.setFillColor(Self.whiteColor); ctx.setAlpha(0.25 * engine.reveal)
    for p in bars.visible {
      let h = max(0, p.value / bars.maxValue * pane.height)
      ctx.fill(CGRect(x: layout.toX(p.time) - width / 2, y: pane.maxY - h, width: width, height: h))
    }
    ctx.restoreGState()
    text(bars.label, at: CGPoint(x: pane.maxX + 8, y: pane.minY + 4), color: secondary)
  }
  private func drawHighlight(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine) {
    guard let time = engine.inspectionTime, engine.configuration.highlight != .none else { return }
    let cal = Self.utcCalendar
    let date = Date(timeIntervalSince1970: time), components = cal.dateComponents([.year, .month], from: date)
    let month = components.month ?? 1
    let startMonth = engine.configuration.highlight == .quarter ? ((month - 1) / 3) * 3 + 1 : month
    guard let start = cal.date(from: DateComponents(year: components.year, month: startMonth, day: 1)),
          let end = cal.date(byAdding: .month, value: engine.configuration.highlight == .quarter ? 3 : 1, to: start) else { return }
    let x1 = min(layout.plot.maxX, max(layout.plot.minX, layout.toX(start.timeIntervalSince1970)))
    let x2 = min(layout.plot.maxX, max(layout.plot.minX, layout.toX(end.timeIntervalSince1970)))
    ctx.saveGState()
    ctx.setFillColor(Self.blackColor); ctx.setAlpha(0.55 * engine.scrubAmount)
    ctx.fill(CGRect(x: layout.plot.minX, y: layout.plot.minY, width: x1 - layout.plot.minX, height: layout.plot.height))
    ctx.fill(CGRect(x: x2, y: layout.plot.minY, width: layout.plot.maxX - x2, height: layout.plot.height))
    ctx.restoreGState()
  }
  private func extremaLabel(_ value: Double) -> (label: String, half: CGFloat) {
    if let hit = extremaLabels[value] { return hit }
    let label = formatValue(value)
    let entry = (label, measure(label, font: labelFont).width / 2)
    if extremaLabels.count > 64 { extremaLabels.removeAll(keepingCapacity: true) }
    extremaLabels[value] = entry
    return entry
  }
  private func drawExtrema(layout: LivelineLayout, engine: LivelineEngine, secondary: CGColor) {
    guard let input = engine.input, let primary = input.series.first(where: { $0.id == input.primaryID }), primary.visible,
          let spline = engine.splines[input.primaryID], let endpoint = spline.points.last else { return }
    // The history's extent is scanned once per data/viewport change; the animated endpoint is folded in per frame.
    let appended = spline.points.count > primary.points.count
    let key = ExtremaKey(revision: engine.revision, x: layout.x, appended: appended)
    if key != extremaKey {
      extremaKey = key
      let history = appended ? primary.points[...] : primary.points.dropLast()
      var hi: LivelinePoint?, lo: LivelinePoint?
      for p in history where layout.x.contains(p.time) {
        if hi == nil || p.value > hi!.value { hi = p }
        if lo == nil || p.value < lo!.value { lo = p }
      }
      extremaBase = (hi, lo)
    }
    var hi = extremaBase.hi, lo = extremaBase.lo
    if layout.x.contains(endpoint.time) {
      if hi == nil || endpoint.value > hi!.value { hi = endpoint }
      if lo == nil || endpoint.value < lo!.value { lo = endpoint }
    }
    guard let hi, let lo else { return }
    for (p, offset) in [(hi, -12.0), (lo, 12.0)] {
      let (label, half) = extremaLabel(p.value)
      let x = min(layout.plot.maxX - half, max(layout.plot.minX + half, layout.toX(p.time)))
      text(label, at: CGPoint(x: x, y: layout.toY(p.value) + offset), color: secondary,
           alpha: engine.reveal * (1 - engine.scrubAmount), alignment: .center)
    }
  }

  // MARK: Endpoint

  private func drawEndpoint(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine, dt: Double) {
    guard let input = engine.input, let series = input.series.first(where: { $0.id == input.primaryID }),
          let spline = engine.splines[input.primaryID], let last = spline.points.last else { return }
    let cfg = engine.configuration
    let visibility = engine.alpha[series.id] ?? series.targetOpacity
    guard visibility > 0.001 else { return }
    let tip = endpoint(spline, layout: layout, reveal: engine.reveal, elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
    let x = tip.x, y = tip.y
    let dim = engine.scrubAmount * 0.7
    let outer = Self.dotOuterColor
    let scale = deviceScale(ctx)
    if cfg.dot && engine.reveal > 0.3 {
      ctx.saveGState(); ctx.setAlpha(visibility)
      if cfg.pulse && !cfg.reduceMotion && input.observation != nil && dim < 0.3 {
        // Rendered as a CAShapeLayer so the ring keeps pulsing while the display link is stopped.
        pulses.append(LivelinePulse(id: series.id, point: tip, color: series.color, growth: 12,
                                    peakAlpha: 0.35, opacity: visibility * max(0, 1 - dim * 3)))
      }
      let blur = 6 * (1 - dim)
      let key = ShadowImageKey(kind: 0, width: 13, blur: Int((blur * 4).rounded()), color: nil, scale: scale)
      if let shadowed = shadowImage(key: key, size: CGSize(width: 13, height: 13), blur: CGFloat(key.blur) / 4,
                                    offset: CGSize(width: 0, height: 1), shadow: Self.dotShadowColor, draw: { sub in
                                      sub.setFillColor(outer.cgColor); sub.fillEllipse(in: CGRect(x: 0, y: 0, width: 13, height: 13))
                                    }) {
        drawImage(shadowed.image, size: shadowed.size, topLeft: CGPoint(x: x - 6.5 - shadowed.inset, y: y - 6.5 - shadowed.inset), in: ctx)
      } else {
        ctx.setFillColor(outer.cgColor)
        ctx.fillEllipse(in: CGRect(x: x - 6.5, y: y - 6.5, width: 13, height: 13))
      }
      ctx.setFillColor(dim > 0 ? blend(series.color.uiColor, outer, fraction: dim).cgColor : cgColor(series.color))
      ctx.fillEllipse(in: CGRect(x: x - 3.5, y: y - 3.5, width: 7, height: 7))
      ctx.restoreGState()
    }
    if cfg.badge {
      let label = label(for: last.value, memo: &displayedLabel), targetWidth = measure(label, font: badgeFont).width + 20
      badgeWidth = cfg.reduceMotion || badgeWidth == 0 ? targetWidth : LivelineMath.lerp(badgeWidth, targetWidth, speed: 0.15, milliseconds: dt)
      badgeY = cfg.reduceMotion || badgeY == nil ? y : LivelineMath.lerp(badgeY!, y, speed: 0.35, milliseconds: dt)
      let tail: CGFloat = cfg.badgeTail ? 5 : 0
      // Quantize the animated width so the shadowed pill bitmap is shared across nearby frames.
      let pillWidth = CGFloat((badgeWidth * 4).rounded() / 4), pillHeight: CGFloat = 22
      let pillColor = cfg.minimalBadge ? nil : series.color
      ctx.saveGState(); ctx.setAlpha(engine.reveal * visibility)
      ctx.translateBy(x: layout.plot.maxX + 4, y: CGFloat(badgeY!) - pillHeight / 2)
      let key = ShadowImageKey(kind: 1, width: Int(pillWidth * 4) + Int(tail) * 10_000, blur: 16, color: pillColor, scale: scale)
      if let shadowed = shadowImage(key: key, size: CGSize(width: tail + pillWidth, height: pillHeight), blur: 4,
                                    offset: CGSize(width: 0, height: 1), shadow: Self.badgeShadowColor, draw: { sub in
                                      sub.setFillColor((pillColor.map { $0.uiColor } ?? outer).cgColor)
                                      sub.addPath(Self.badgePath(width: pillWidth, height: pillHeight, tail: tail)); sub.fillPath()
                                    }) {
        drawImage(shadowed.image, size: shadowed.size, topLeft: CGPoint(x: -shadowed.inset, y: -shadowed.inset), in: ctx)
      } else {
        ctx.setFillColor((pillColor.map { $0.uiColor } ?? outer).cgColor)
        ctx.addPath(Self.badgePath(width: pillWidth, height: pillHeight, tail: tail)); ctx.fillPath()
      }
      text(label, at: CGPoint(x: tail + pillWidth / 2, y: pillHeight / 2),
           color: cfg.minimalBadge ? Self.whiteColor : Self.blackColor, alignment: .center, font: badgeFont)
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
  static let crosshairFadeMinPX: CGFloat = 5

  /// The crosshair fades out as it approaches the live dot, where the chart's own
  /// endpoint readout takes over (wallet Liveline behavior).
  func crosshairOpacity(x: CGFloat, liveDotX: CGFloat, plotWidth: CGFloat) -> Double {
    let dist = liveDotX - x
    let fadeStart = min(80, plotWidth * 0.3)
    if dist < Self.crosshairFadeMinPX { return 0 }
    if dist >= fadeStart { return 1 }
    return Double((dist - Self.crosshairFadeMinPX) / (fadeStart - Self.crosshairFadeMinPX))
  }

  // MARK: Crosshair

  private func drawCrosshair(_ ctx: CGContext, layout: LivelineLayout, engine: LivelineEngine) {
    // `selection(at:)` is memoized in the engine, so this shares the view's published selection.
    guard let time = engine.inspectionTime, let selection = engine.selection(at: time) else { return }
    let cfg = engine.configuration
    let x = layout.toX(time), y = min(layout.plot.maxY, max(layout.plot.minY, layout.toY(selection.value)))
    var fade = 1.0
    if cfg.seriesLabels.isEmpty, cfg.dot, let input = engine.input, let spline = engine.splines[input.primaryID] {
      let dot = endpoint(spline, layout: layout, reveal: engine.reveal, elapsed: cfg.reduceMotion ? 0 : engine.elapsed)
      fade = crosshairOpacity(x: x, liveDotX: dot.x, plotWidth: layout.plot.width)
    }
    let opacity = engine.scrubAmount * fade
    guard opacity > 0.01 else { return }
    let lineAlpha = 0.68 * opacity
    line(ctx, from: CGPoint(x: x, y: layout.plot.minY), to: CGPoint(x: x, y: layout.volume?.maxY ?? layout.plot.maxY),
         color: Self.whiteColor, alpha: lineAlpha, dash: [4, 4])
    if !cfg.seriesLabels.isEmpty {
      ctx.saveGState()
      for series in engine.input?.series ?? [] where series.visible {
        guard let value = selection.values[series.id] else { continue }
        let y = layout.toY(value * series.multiplier)
        guard y >= layout.plot.minY, y <= layout.plot.maxY else { continue }
        ctx.setFillColor(cgColor(series.color))
        ctx.setAlpha(engine.scrubAmount * (engine.alpha[series.id] ?? series.targetOpacity))
        ctx.fillEllipse(in: CGRect(x: x - 3, y: y - 3, width: 6, height: 6))
      }
      ctx.restoreGState()
      return
    }
    line(ctx, from: CGPoint(x: layout.plot.minX, y: y), to: CGPoint(x: layout.plot.maxX, y: y), color: Self.whiteColor, alpha: lineAlpha, dash: [4, 4])
    let radius = CGFloat(4 * min(1, opacity * 3))
    ctx.saveGState(); ctx.setAlpha(fade)
    ctx.setFillColor(Self.whiteColor); ctx.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
    ctx.restoreGState()
  }

  // MARK: Primitives

  private func line(_ ctx: CGContext, from: CGPoint, to: CGPoint, color: CGColor, alpha: Double, dash: [CGFloat] = []) {
    ctx.saveGState(); ctx.setStrokeColor(color); ctx.setAlpha(alpha); ctx.setLineWidth(1); ctx.setLineDash(phase: 0, lengths: dash)
    ctx.move(to: from); ctx.addLine(to: to); ctx.strokePath(); ctx.restoreGState()
  }
  private enum Alignment { case leading, center }
  private func measure(_ string: String, font: UIFont) -> CGSize { LivelineTextCache.shared.size(string, font: font) }
  /// Draws `string` in an opaque `color` at `alpha`. The typeset line is cached at full alpha;
  /// fading labels only vary the context alpha.
  private func text(_ string: String, at point: CGPoint, color: CGColor, alpha: Double = 1, alignment: Alignment = .leading, font: UIFont? = nil) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }
    let font = font ?? labelFont, size = measure(string, font: font)
    let colorAlpha = color.alpha
    let opaque = colorAlpha >= 1 ? color : color.copy(alpha: 1) ?? color
    let cached = LivelineTextCache.shared.line(string, font: font, color: opaque)
    let origin = CGPoint(x: point.x - (alignment == .center ? size.width / 2 : 0), y: point.y - size.height / 2)
    ctx.saveGState()
    ctx.setAlpha(alpha * colorAlpha)
    ctx.textMatrix = .identity
    ctx.translateBy(x: origin.x, y: origin.y + size.height)
    ctx.scaleBy(x: 1, y: -1)
    ctx.textPosition = CGPoint(x: 0, y: cached.descent)
    CTLineDraw(cached.line, ctx)
    ctx.restoreGState()
  }
}
#endif
