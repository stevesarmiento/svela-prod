#if canImport(UIKit)
import SwiftUI
import UIKit
import Accessibility

public struct LivelineView: UIViewRepresentable {
  public var input: LivelineInput
  public var configuration: LivelineConfiguration
  public var isActive: Bool
  /// Hosts using onScrollVisibilityChange already deliver boundary updates.
  public var tracksScrollVisibility: Bool
  public var formatValue: (Double) -> String
  public var formatVolume: (Double) -> String
  public var formatTime: (Double) -> String
  public var onSelection: (LivelineSelection?) -> Void
  public init(input: LivelineInput, configuration: LivelineConfiguration = .init(), isActive: Bool = true,
              tracksScrollVisibility: Bool = true,
              formatValue: @escaping (Double) -> String,
              formatVolume: @escaping (Double) -> String = { String(format: "%.0f", $0) },
              formatTime: @escaping (Double) -> String,
              onSelection: @escaping (LivelineSelection?) -> Void = { _ in }) {
    self.input = input; self.configuration = configuration; self.isActive = isActive
    self.tracksScrollVisibility = tracksScrollVisibility
    self.formatValue = formatValue; self.formatVolume = formatVolume; self.formatTime = formatTime
    self.onSelection = onSelection
  }
  public func makeUIView(context: Context) -> LivelineChartView {
    LivelineChartView(isDecorative: configuration.compact && !configuration.scrub,
                      tracksScrollVisibility: tracksScrollVisibility)
  }
  public func updateUIView(_ view: LivelineChartView, context: Context) {
    view.apply(input: input, configuration: configuration, isActive: isActive,
               formatValue: formatValue, formatVolume: formatVolume, formatTime: formatTime, onSelection: onSelection)
  }
  public static func dismantleUIView(_ view: LivelineChartView, coordinator: Void) { view.suspend() }
}

@MainActor
public final class LivelineChartView: UIView, @preconcurrency AXChart {
  private let engine = LivelineEngine()
  private let renderer = LivelineRenderer()
  private let renderBuffer = LivelineRenderBuffer()
  private let pulseLayers = LivelinePulseLayers()
  private var displayLink: CADisplayLink?
  private var active = true
  private var frameDelta = 16.67
  private var lastTimestamp: CFTimeInterval?
  private var onSelection: (LivelineSelection?) -> Void = { _ in }
  private var lastSelection: LivelineSelection?
  private var observations: [NSKeyValueObservation] = []
  private var inspectionX: CGFloat?
  private var scrubGesture = LivelineScrubGesture()
  private var holdTask: Task<Void, Never>?
  private var activeTouch: UITouch?
  private var settleFrames = 0
  private let isDecorative: Bool
  private let tracksScrollVisibility: Bool
  private var lastScrollVisibility: Bool?
  private var lastLayoutSize: CGSize = .zero
  private var comparisonContainer: CALayer?
  private var comparisonLayers: [String: CAShapeLayer] = [:]
  private var comparisonLayout: LivelineLayout?
  #if DEBUG
  private(set) var displayLinkStartCount = 0
  var hasActiveDisplayLink: Bool { displayLink != nil }
  var scrollObserverCount: Int { observations.count }
  private(set) var rasterDrawCount = 0
  var compositedSeriesCount: Int { comparisonLayers.count }
  func compositedOpacity(for id: String) -> Float? { comparisonLayers[id]?.opacity }
  var pulseRingCount: Int { pulseLayers.ringCount }
  func pulseRingAnimating(for id: String) -> Bool { pulseLayers.isAnimating(id: id) }
  #endif
  private let haptic = UISelectionFeedbackGenerator()
  public var accessibilityChartDescriptor: AXChartDescriptor?

  /// Decorative card charts rely on their host's visibility updates and never
  /// participate in scroll gestures or observe every content-offset change.
  public init(isDecorative: Bool = false, tracksScrollVisibility: Bool = true) {
    self.isDecorative = isDecorative
    self.tracksScrollVisibility = tracksScrollVisibility
    super.init(frame: .zero)
    isOpaque = false; backgroundColor = .clear
    layer.contentsGravity = .resize
    isMultipleTouchEnabled = false
    accessibilityIdentifier = "native-price-chart"
    isAccessibilityElement = true; accessibilityLabel = "Price chart"
    accessibilityHint = "Swipe up or down to inspect historical prices."
    accessibilityTraits = [.adjustable]
    if !isDecorative {
      let hover = UIHoverGestureRecognizer(target: self, action: #selector(hover(_:))); addGestureRecognizer(hover)
    } else {
      isUserInteractionEnabled = false
      isAccessibilityElement = false
      accessibilityTraits = []
    }
    NotificationCenter.default.addObserver(self, selector: #selector(activityChanged), name: UIApplication.didBecomeActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(activityChanged), name: UIApplication.willResignActiveNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(activityChanged), name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
  isolated deinit {
    holdTask?.cancel()
    displayLink?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  func apply(input: LivelineInput, configuration: LivelineConfiguration, isActive: Bool,
             formatValue: @escaping (Double) -> String, formatVolume: @escaping (Double) -> String,
             formatTime: @escaping (Double) -> String, onSelection: @escaping (LivelineSelection?) -> Void) {
    let changed = engine.input != input
    let emphasisOnly = engine.input.map { input.matchesExceptOpacity($0) } ?? false
    let identityChanged = engine.input?.id != input.id
    var config = configuration
    config.reduceMotion = config.reduceMotion || UIAccessibility.isReduceMotionEnabled
    let configurationChanged = engine.configuration != config
    if (changed && !emphasisOnly) || configurationChanged { clearComparisonLayers() }
    active = isActive
    self.onSelection = onSelection
    renderer.formatValue = formatValue; renderer.formatVolume = formatVolume; renderer.formatTime = formatTime
    engine.update(input, configuration: config, marketTime: Date().timeIntervalSince1970)
    if identityChanged { pulseLayers.removeAll() }
    if identityChanged && !isDecorative {
      inspectionX = nil; lastSelection = nil
      Task { @MainActor [weak self] in self?.onSelection(nil) }
    }
    if changed && !isDecorative && !emphasisOnly { updateAccessibility(input) }
    if changed || configurationChanged {
      settleFrames = 1
    }
    wake()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    observations = []
    lastScrollVisibility = nil
    if isDecorative {
      if window != nil { renderToLayer() }
      wake(); return
    }
    var parent = superview
    while let view = parent {
      if let scroll = view as? UIScrollView {
        if tracksScrollVisibility {
          observations.append(scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
            // UIKit scroll offsets are delivered on the main thread. Only
            // visibility boundaries need work, not a Task for every pixel.
            MainActor.assumeIsolated { self?.scrollVisibilityChanged() }
          })
        }
      }
      parent = view.superview
    }
    // Synchronous first frame so entering a window never shows an empty layer.
    if window != nil { renderToLayer() }
    wake()
  }
  private func scrollVisibilityChanged() {
    let next = visible
    guard lastScrollVisibility != next else { return }
    lastScrollVisibility = next
    if next { wake() } else { suspend() }
  }
  public override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.size != lastLayoutSize {
      clearComparisonLayers()
      lastLayoutSize = bounds.size
      settleFrames = 1
      // Synchronous repaint so a resize never shows a stretched backing image.
      if window != nil { renderToLayer() }
      wake()
    }
  }

  /// Renders the chart into the reused bitmap and installs it as the layer's contents.
  /// Replaces `draw(_:)`: rendering happens only on display-link ticks (plus the two
  /// synchronous first-frame cases), never from UIKit's invalidation machinery.
  private func renderToLayer() {
    guard bounds.width > 1, bounds.height > 1 else { return }
    let scale = max(1, window?.screen.scale ?? traitCollection.displayScale)
    let pixelWidth = max(1, Int(ceil(bounds.width * scale)))
    let pixelHeight = max(1, Int(ceil(bounds.height * scale)))
    guard let ctx = renderBuffer.context(pixelWidth: pixelWidth, pixelHeight: pixelHeight) else { return }
    #if DEBUG
    rasterDrawCount += 1
    #endif
    // Reused buffer: clear last frame (device space, before any CTM changes).
    ctx.clear(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
    ctx.saveGState()
    UIGraphicsPushContext(ctx)
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: 0, y: bounds.height)
    ctx.scaleBy(x: 1, y: -1)
    renderer.draw(ctx, size: bounds.size, engine: engine, frameMilliseconds: frameDelta,
                  drawsSeries: comparisonContainer == nil)
    UIGraphicsPopContext()
    ctx.restoreGState()
    layer.contentsScale = scale
    layer.contents = ctx.makeImage()
    // Sublayers (pulse rings, promoted comparison lines) composite above the bitmap.
    pulseLayers.sync(renderer.pulses, in: layer, bounds: bounds, scale: scale, animating: window != nil)
  }

  private func clearComparisonLayers() {
    guard comparisonContainer != nil else { return }
    comparisonContainer?.removeFromSuperlayer()
    comparisonContainer = nil; comparisonLayers = [:]; comparisonLayout = nil
    settleFrames = max(1, settleFrames)
  }

  /// A settled comparison has static geometry. Keep its lines on individual
  /// compositor layers so selection fades change opacity without repainting
  /// the entire chart. Scrubbing, data, and viewport changes use the renderer.
  private func updateComparisonLayers(isAnimating: Bool) -> Bool {
    let config = engine.configuration
    guard let input = engine.input, !config.seriesLabels.isEmpty,
          !config.fill, !config.dot, !config.badge, !config.extrema,
          input.band == nil, input.volume.isEmpty, input.projectionID == nil,
          input.state == .ready, engine.reveal == 1, engine.inspectionTime == nil else {
      clearComparisonLayers(); return false
    }
    let layout = renderer.layout(size: bounds.size, engine: engine)
    if comparisonLayout != layout { clearComparisonLayers() }
    if comparisonContainer == nil {
      guard !isAnimating else { return false }
      let container = CALayer()
      container.frame = bounds
      if config.grid {
        let mask = CAGradientLayer()
        mask.frame = layout.plot.insetBy(dx: -1, dy: -1)
        mask.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor]
        mask.locations = [0, NSNumber(value: min(40, layout.plot.width * 0.12) / mask.bounds.width), 1]
        mask.startPoint = CGPoint(x: 0, y: 0.5); mask.endPoint = CGPoint(x: 1, y: 0.5)
        container.mask = mask
      } else {
        let mask = CAShapeLayer()
        mask.path = CGPath(rect: layout.plot.insetBy(dx: -1, dy: -1), transform: nil)
        container.mask = mask
      }
      CATransaction.begin(); CATransaction.setDisableActions(true)
      for series in input.series {
        guard let spline = engine.splines[series.id], spline.points.count >= 2 else { continue }
        let line = CAShapeLayer()
        line.frame = bounds
        line.contentsScale = window?.screen.scale ?? contentScaleFactor
        line.path = renderer.curve(spline, id: series.id, multiplier: series.multiplier,
                                  layout: layout, reveal: 1, elapsed: engine.elapsed)
        line.fillColor = nil; line.strokeColor = series.color.uiColor.cgColor
        line.lineWidth = series.width; line.lineCap = .round; line.lineJoin = .round
        line.lineDashPattern = series.dash.map { NSNumber(value: $0) }
        line.opacity = Float(engine.alpha[series.id] ?? series.targetOpacity)
        container.addSublayer(line)
        comparisonLayers[series.id] = line
      }
      layer.addSublayer(container)
      comparisonContainer = container; comparisonLayout = layout
      CATransaction.commit()
      // Replace the old painted lines with an axes-only backing image once.
      return false
    }
    CATransaction.begin(); CATransaction.setDisableActions(true)
    for series in input.series {
      comparisonLayers[series.id]?.opacity = Float(engine.alpha[series.id] ?? series.targetOpacity)
    }
    CATransaction.commit()
    return true
  }
  private var visible: Bool {
    guard active, let window, !isHidden, alpha > 0, bounds.width > 0, bounds.height > 0,
          window.windowScene?.activationState != .background else { return false }
    var rect = convert(bounds, to: window)
    var ancestor = superview
    while let view = ancestor {
      if view.isHidden || view.alpha < 0.01 { return false }
      if view.clipsToBounds { rect = rect.intersection(view.convert(view.bounds, to: window)) }
      ancestor = view.superview
    }
    return !rect.intersection(window.bounds).isEmpty
  }
  @objc private func activityChanged() {
    if UIApplication.shared.applicationState != .active { suspend() }
    else { wake() }
  }
  private func wake() {
    guard visible else { suspend(); return }
    // A settled chart's backing layer scrolls with its parent. There is nothing
    // to redraw until its data, appearance, or actual plot dimensions change.
    if settleFrames <= 0 && !engine.isAnimating && inspectionX == nil { return }
    guard displayLink == nil else { return }
    #if DEBUG
    displayLinkStartCount += 1
    #endif
    engine.resetClock(); lastTimestamp = nil
    let link = CADisplayLink(target: DisplayTarget(self), selector: #selector(DisplayTarget.tick(_:)))
    // Engine math is frame-rate independent; prefer ProMotion rates while anything moves.
    // The link stops whenever the chart settles, so this costs nothing at rest.
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
    link.add(to: .main, forMode: .common); displayLink = link
  }
  public func stop() { displayLink?.invalidate(); displayLink = nil; lastTimestamp = nil; engine.resetClock() }
  #if DEBUG
  /// The layout the renderer is currently drawing with (tests pin readouts against it).
  var currentLayout: LivelineLayout { renderer.layout(size: bounds.size, engine: engine) }
  #endif
  func suspend() {
    // Clear a visible crosshair on the next frame when the chart returns.
    if engine.inspectionTime != nil { settleFrames = max(1, settleFrames) }
    holdTask?.cancel(); holdTask = nil; activeTouch = nil
    _ = scrubGesture.ended()
    inspectionX = nil; engine.clearInspection(); stop()
    pulseLayers.stopAnimating()
    // Visibility can change inside a SwiftUI update. Publish the cleared readout afterward.
    if lastSelection != nil {
      Task { @MainActor [weak self] in
        guard let self, engine.inspectionTime == nil else { return }
        publishSelection()
      }
    }
  }
  fileprivate func tick(_ link: CADisplayLink) {
    guard visible else { suspend(); return }
    frameDelta = min(50, max(0, (link.timestamp - (lastTimestamp ?? (link.timestamp - 1 / 60))) * 1000))
    lastTimestamp = link.timestamp
    if let x = inspectionX { engine.selectedTime = renderer.layout(size: bounds.size, engine: engine).time(x) }
    let animated = engine.advance(monotonicTime: link.timestamp, marketTime: Date().timeIntervalSince1970)
    publishSelection()
    if !updateComparisonLayers(isAnimating: animated) { renderToLayer() }
    settleFrames -= 1
    if !animated && settleFrames <= 0 && inspectionX == nil { stop() }
  }

  // MARK: Scrubbing
  //
  // A touch is only a scrub once the finger holds still or travels horizontally; until then the
  // enclosing scroll view may claim it. See `LivelineScrubGesture` for the policy.

  public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard !isDecorative, engine.configuration.scrub, let touch = touches.first,
          renderer.layout(size: bounds.size, engine: engine).plot.contains(touch.location(in: self)) else { return }
    activeTouch = touch
    apply(scrubGesture.began(at: touch.location(in: self)))
    holdTask?.cancel()
    holdTask = Task { @MainActor [weak self] in
      try? await Task.sleep(for: .seconds(LivelineScrubGesture.holdDelay))
      guard !Task.isCancelled, let self else { return }
      self.apply(self.scrubGesture.holdTimerFired())
    }
  }
  public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard let activeTouch, touches.contains(activeTouch) else { return }
    apply(scrubGesture.moved(to: activeTouch.location(in: self)))
  }
  public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { finishTouch() }
  public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { finishTouch() }
  private func finishTouch() {
    holdTask?.cancel(); holdTask = nil
    activeTouch = nil
    apply(scrubGesture.ended())
  }

  /// UIKit asks the hit-test view before an ancestor's pan (the scroll view, pull-to-dismiss)
  /// begins. Vertical motion scrolls; horizontal motion and an active scrub stay with the chart.
  public override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard !isDecorative, engine.configuration.scrub, let pan = gestureRecognizer as? UIPanGestureRecognizer else {
      return super.gestureRecognizerShouldBegin(gestureRecognizer)
    }
    return scrubGesture.shouldAllowPan(velocity: pan.velocity(in: self))
  }

  /// Applies a scrub decision. Internal so tests can drive the policy without
  /// synthesizing `UITouch`es.
  func apply(_ decision: LivelineScrubGesture.Decision) {
    switch decision {
    case .none:
      return
    case .start(let x):
      inspect(CGPoint(x: clampToPlot(x), y: 0))
    case .update(let x):
      let clamped = clampToPlot(x)
      // Sub-point moves land on the same column; skip the redundant frame and readout.
      if let current = inspectionX, abs(clamped - current) < 1 { return }
      inspect(CGPoint(x: clamped, y: 0))
    case .end:
      endInspection()
    }
  }
  private func clampToPlot(_ x: CGFloat) -> CGFloat {
    let plot = renderer.layout(size: bounds.size, engine: engine).plot
    return min(max(x, plot.minX), plot.maxX)
  }
  private func inspect(_ location: CGPoint) {
    guard engine.configuration.scrub else { return }
    if inspectionX == nil && engine.configuration.scrubStartHaptic { haptic.selectionChanged(); haptic.prepare() }
    inspectionX = location.x
    engine.selectedTime = renderer.layout(size: bounds.size, engine: engine).time(location.x)
    publishSelection(); settleFrames = 1; wake()
  }
  private func endInspection() {
    // A vertical scroll never starts inspection. It must not schedule chart
    // frames just to clear an absent crosshair.
    guard inspectionX != nil || engine.selectedTime != nil else { return }
    inspectionX = nil; engine.selectedTime = nil
    publishSelection(); settleFrames = 1; wake()
  }
  private func publishSelection() {
    var selection = engine.inspectionTime.flatMap { engine.selection(at: $0) }
    if let time = selection?.time {
      // The exact x the crosshair is drawn at, so a host tooltip never disagrees with the line.
      selection?.x = renderer.layout(size: bounds.size, engine: engine).toX(time)
    }
    guard selection != lastSelection else { return }
    lastSelection = selection
    if let selection { accessibilityValue = "\(renderer.formatTime(selection.time)), \(renderer.formatValue(selection.value))" }
    else { accessibilityValue = renderer.formatValue(engine.displayedValue) }
    onSelection(selection)
  }
  @objc private func hover(_ gesture: UIHoverGestureRecognizer) {
    switch gesture.state {
    case .began, .changed:
      guard engine.configuration.scrub,
            renderer.layout(size: bounds.size, engine: engine).plot.contains(gesture.location(in: self)) else { return }
      inspect(CGPoint(x: clampToPlot(gesture.location(in: self).x), y: 0))
    default: endInspection()
    }
  }
  public override func accessibilityIncrement() { adjustSelection(1) }
  public override func accessibilityDecrement() { adjustSelection(-1) }
  private func adjustSelection(_ direction: Int) {
    guard let input = engine.input, let points = engine.splines[input.primaryID]?.points, !points.isEmpty else { return }
    let current = engine.selectedTime ?? points.last!.time
    let index = points.indices.min { abs(points[$0].time - current) < abs(points[$1].time - current) } ?? 0
    engine.selectedTime = points[min(points.count - 1, max(0, index + direction))].time
    inspectionX = nil; publishSelection(); settleFrames = 1; wake()
  }
  private func updateAccessibility(_ input: LivelineInput) {
    guard let primary = input.series.first(where: { $0.id == input.primaryID }),
          let first = primary.points.first, let last = primary.points.last, first.time < last.time else { accessibilityChartDescriptor = nil; return }
    let timeFormatter = renderer.formatTime, valueFormatter = renderer.formatValue
    if !engine.configuration.seriesLabels.isEmpty {
      let visible = input.series.filter { $0.visible && !$0.points.isEmpty }
      let points = visible.flatMap(\.points)
      guard let start = points.map(\.time).min(), let end = points.map(\.time).max(), start < end else {
        accessibilityChartDescriptor = nil; return
      }
      let x = AXNumericDataAxisDescriptor(title: "Time", range: start...end, gridlinePositions: [], valueDescriptionProvider: timeFormatter)
      let range = LivelineMath.range(visible.flatMap { s in s.points.map { $0.value * s.multiplier } })
      let y = AXNumericDataAxisDescriptor(title: "Return", range: range, gridlinePositions: [], valueDescriptionProvider: valueFormatter)
      let series = visible.map { s in
        AXDataSeriesDescriptor(name: engine.configuration.seriesLabels[s.id] ?? s.id, isContinuous: true,
                               dataPoints: s.points.map { AXDataPoint(x: $0.time, y: $0.value * s.multiplier) })
      }
      accessibilityChartDescriptor = AXChartDescriptor(title: "Comparison performance", summary: "\(series.count) visible series.",
                                                       xAxis: x, yAxis: y, series: series)
      accessibilityValue = "\(series.count) visible series"
      return
    }
    let x = AXNumericDataAxisDescriptor(title: "Time", range: first.time...last.time, gridlinePositions: [], valueDescriptionProvider: timeFormatter)
    let range = LivelineMath.range(primary.points.map(\.value))
    let y = AXNumericDataAxisDescriptor(title: "Price", range: range, gridlinePositions: [], valueDescriptionProvider: valueFormatter)
    let series = AXDataSeriesDescriptor(name: "Price", isContinuous: true, dataPoints: primary.points.map { AXDataPoint(x: $0.time, y: $0.value) })
    accessibilityChartDescriptor = AXChartDescriptor(title: "Price history", summary: "\(primary.points.count) observations. Latest \(valueFormatter(last.value)).", xAxis: x, yAxis: y, series: [series])
    if engine.selectedTime == nil { accessibilityValue = valueFormatter(last.value) }
  }
}

@MainActor
private final class DisplayTarget: NSObject {
  weak var view: LivelineChartView?
  init(_ view: LivelineChartView) { self.view = view }
  @objc func tick(_ link: CADisplayLink) { view?.tick(link) }
}
#endif
