#if canImport(UIKit)
import SwiftUI
import UIKit
import Accessibility

public struct LivelineView: UIViewRepresentable {
  public var input: LivelineInput
  public var configuration: LivelineConfiguration
  public var isActive: Bool
  public var formatValue: (Double) -> String
  public var formatVolume: (Double) -> String
  public var formatTime: (Double) -> String
  public var onSelection: (LivelineSelection?) -> Void
  public init(input: LivelineInput, configuration: LivelineConfiguration = .init(), isActive: Bool = true,
              formatValue: @escaping (Double) -> String,
              formatVolume: @escaping (Double) -> String = { String(format: "%.0f", $0) },
              formatTime: @escaping (Double) -> String,
              onSelection: @escaping (LivelineSelection?) -> Void = { _ in }) {
    self.input = input; self.configuration = configuration; self.isActive = isActive
    self.formatValue = formatValue; self.formatVolume = formatVolume; self.formatTime = formatTime
    self.onSelection = onSelection
  }
  public func makeUIView(context: Context) -> LivelineChartView {
    LivelineChartView(isDecorative: configuration.compact && !configuration.scrub)
  }
  public func updateUIView(_ view: LivelineChartView, context: Context) {
    view.apply(input: input, configuration: configuration, isActive: isActive,
               formatValue: formatValue, formatVolume: formatVolume, formatTime: formatTime, onSelection: onSelection)
  }
  public static func dismantleUIView(_ view: LivelineChartView, coordinator: Void) { view.suspend() }
}

@MainActor
public final class LivelineChartView: UIView, @preconcurrency AXChart, UIGestureRecognizerDelegate {
  private let engine = LivelineEngine()
  private let renderer = LivelineRenderer()
  private var displayLink: CADisplayLink?
  private var active = true
  private var frameDelta = 16.67
  private var lastTimestamp: CFTimeInterval?
  private var onSelection: (LivelineSelection?) -> Void = { _ in }
  private var lastSelection: LivelineSelection?
  private var observations: [NSKeyValueObservation] = []
  private var inspectionX: CGFloat?
  private var isHolding = false
  private var settleFrames = 0
  private let isDecorative: Bool
  private var lastLayoutSize: CGSize = .zero
  #if DEBUG
  private(set) var displayLinkStartCount = 0
  var hasActiveDisplayLink: Bool { displayLink != nil }
  #endif
  private let haptic = UISelectionFeedbackGenerator()
  private lazy var pan = LivelinePanRecognizer(target: self, action: #selector(scrub(_:)))
  private lazy var hold = UILongPressGestureRecognizer(target: self, action: #selector(hold(_:)))
  public var accessibilityChartDescriptor: AXChartDescriptor?

  /// Decorative card charts rely on their host's visibility updates and never
  /// participate in scroll gestures or observe every content-offset change.
  public init(isDecorative: Bool = false) {
    self.isDecorative = isDecorative
    super.init(frame: .zero)
    isOpaque = false; backgroundColor = .clear; contentMode = .redraw
    accessibilityIdentifier = "native-price-chart"
    isAccessibilityElement = true; accessibilityLabel = "Price chart"
    accessibilityHint = "Swipe up or down to inspect historical prices."
    accessibilityTraits = [.adjustable]
    if !isDecorative {
      pan.maximumNumberOfTouches = 1; pan.delegate = self; addGestureRecognizer(pan)
      hold.minimumPressDuration = 0.18; hold.allowableMovement = 8; hold.delegate = self; addGestureRecognizer(hold)
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
    displayLink?.invalidate()
    NotificationCenter.default.removeObserver(self)
  }

  func apply(input: LivelineInput, configuration: LivelineConfiguration, isActive: Bool,
             formatValue: @escaping (Double) -> String, formatVolume: @escaping (Double) -> String,
             formatTime: @escaping (Double) -> String, onSelection: @escaping (LivelineSelection?) -> Void) {
    let changed = engine.input != input
    let identityChanged = engine.input?.id != input.id
    var config = configuration
    config.reduceMotion = config.reduceMotion || UIAccessibility.isReduceMotionEnabled
    let configurationChanged = engine.configuration != config
    active = isActive
    self.onSelection = onSelection
    renderer.formatValue = formatValue; renderer.formatVolume = formatVolume; renderer.formatTime = formatTime
    engine.update(input, configuration: config, marketTime: Date().timeIntervalSince1970)
    if identityChanged && !isDecorative {
      inspectionX = nil; lastSelection = nil
      Task { @MainActor [weak self] in self?.onSelection(nil) }
    }
    if changed && !isDecorative { updateAccessibility(input) }
    if !isDecorative || changed || configurationChanged {
      settleFrames = isDecorative ? 1 : 90
    }
    wake()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    observations = []
    if isDecorative { wake(); return }
    var parent = superview
    while let view = parent {
      if let scroll = view as? UIScrollView {
        scroll.panGestureRecognizer.require(toFail: pan)
        observations.append(scroll.observe(\.contentOffset, options: [.new]) { [weak self] _, _ in
          Task { @MainActor [weak self] in self?.wake() }
        })
      }
      parent = view.superview
    }
    wake()
  }
  public override func layoutSubviews() {
    super.layoutSubviews()
    if !isDecorative || bounds.size != lastLayoutSize {
      lastLayoutSize = bounds.size
      settleFrames = isDecorative ? 1 : 90
      wake()
    }
  }
  public override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    renderer.draw(context, size: bounds.size, engine: engine, frameMilliseconds: frameDelta)
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
    // A settled card's backing layer scrolls with its parent. There is nothing
    // to redraw until its data, appearance, or actual plot dimensions change.
    if isDecorative && settleFrames <= 0 && !engine.isAnimating { return }
    guard displayLink == nil else { return }
    #if DEBUG
    displayLinkStartCount += 1
    #endif
    engine.resetClock(); lastTimestamp = nil
    let link = CADisplayLink(target: DisplayTarget(self), selector: #selector(DisplayTarget.tick(_:)))
    // 60 Hz reference cadence first; engine math is independent of display frequency.
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
    link.add(to: .main, forMode: .common); displayLink = link
  }
  public func stop() { displayLink?.invalidate(); displayLink = nil; lastTimestamp = nil; engine.resetClock() }
  func suspend() {
    inspectionX = nil; isHolding = false; engine.clearInspection(); stop()
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
    setNeedsDisplay()
    settleFrames -= 1
    if !animated && settleFrames <= 0 && inspectionX == nil { stop() }
  }
  private func inspect(_ location: CGPoint) {
    guard engine.configuration.scrub else { return }
    if inspectionX == nil { haptic.selectionChanged(); haptic.prepare() }
    inspectionX = location.x
    engine.selectedTime = renderer.layout(size: bounds.size, engine: engine).time(location.x)
    publishSelection(); settleFrames = 90; wake()
  }
  private func endInspection() {
    inspectionX = nil; engine.selectedTime = nil; isHolding = false
    publishSelection(); settleFrames = 90; wake()
  }
  private func publishSelection() {
    let selection = engine.inspectionTime.flatMap { engine.selection(at: $0) }
    guard selection != lastSelection else { return }
    lastSelection = selection
    if let selection { accessibilityValue = "\(renderer.formatTime(selection.time)), \(renderer.formatValue(selection.value))" }
    else { accessibilityValue = renderer.formatValue(engine.displayedValue) }
    onSelection(selection)
  }
  @objc private func scrub(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began, .changed: inspect(gesture.location(in: self))
    case .ended, .cancelled, .failed: if !isHolding { endInspection() }
    default: break
    }
  }
  @objc private func hold(_ gesture: UILongPressGestureRecognizer) {
    switch gesture.state {
    case .began, .changed: isHolding = true; inspect(gesture.location(in: self))
    case .ended, .cancelled, .failed: endInspection()
    default: break
    }
  }
  @objc private func hover(_ gesture: UIHoverGestureRecognizer) {
    switch gesture.state {
    case .began, .changed: inspect(gesture.location(in: self))
    default: endInspection()
    }
  }
  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    engine.configuration.scrub && renderer.layout(size: bounds.size, engine: engine).plot.contains(touch.location(in: self))
  }
  public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
    (gestureRecognizer === pan && otherGestureRecognizer === hold) || (gestureRecognizer === hold && otherGestureRecognizer === pan)
  }
  public override func accessibilityIncrement() { adjustSelection(1) }
  public override func accessibilityDecrement() { adjustSelection(-1) }
  private func adjustSelection(_ direction: Int) {
    guard let input = engine.input, let points = engine.splines[input.primaryID]?.points, !points.isEmpty else { return }
    let current = engine.selectedTime ?? points.last!.time
    let index = points.indices.min { abs(points[$0].time - current) < abs(points[$1].time - current) } ?? 0
    engine.selectedTime = points[min(points.count - 1, max(0, index + direction))].time
    inspectionX = nil; publishSelection(); settleFrames = 90; wake()
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

/// Resolve direction before UIPanGestureRecognizer is allowed to begin.
@MainActor
private final class LivelinePanRecognizer: UIPanGestureRecognizer {
  private var start: CGPoint?
  private var decided = false
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    start = touches.first?.location(in: view)
    super.touchesBegan(touches, with: event)
  }
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    if !decided, let start, let current = touches.first?.location(in: view) {
      let dx = current.x - start.x, dy = current.y - start.y
      guard max(abs(dx), abs(dy)) >= 8 else { return }
      decided = true
      if abs(dx) < abs(dy) * 1.5 { state = .failed; return }
    }
    super.touchesMoved(touches, with: event)
  }
  override func reset() { super.reset(); start = nil; decided = false }
}
#endif
