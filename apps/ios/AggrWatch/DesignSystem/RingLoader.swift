import SwiftUI
import UIKit

/// The app's spinner: a faint ring with a bright line that eases around it, lap after lap. The
/// head leads and the tail follows on the same curve a beat later, so the line lengthens as it
/// speeds up and gathers as it slows, and nothing ever overshoots or moves backwards. A slow
/// drift underneath keeps it from reading as stalled between laps.
///
/// Core Animation drives it rather than SwiftUI, so it keeps moving while the main thread is
/// busy, which is exactly when a loader is on screen.
struct RingLoader: View {
  enum Size {
    case small, regular, large

    var diameter: CGFloat {
      switch self {
      case .small: 16
      case .regular: 22
      case .large: 36
      }
    }
  }

  var size: Size = .regular
  var tint: Color = .white
  /// Shown under the ring, as `ProgressView("…")` did.
  var label: String? = nil

  init(size: Size = .regular, tint: Color = .white) {
    self.size = size
    self.tint = tint
  }

  init(_ label: String, size: Size = .regular, tint: Color = .white) {
    self.size = size
    self.tint = tint
    self.label = label
  }

  var body: some View {
    VStack(spacing: 8) {
      RingLoaderRepresentable(tint: UIColor(tint))
        .frame(width: size.diameter, height: size.diameter)
      if let label {
        Text(label).foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label ?? "Loading")
    .accessibilityAddTraits(.updatesFrequently)
  }
}

private struct RingLoaderRepresentable: UIViewRepresentable {
  let tint: UIColor

  func makeUIView(context: Context) -> RingLoaderView {
    let view = RingLoaderView()
    view.lineColor = tint
    return view
  }

  func updateUIView(_ view: RingLoaderView, context: Context) {
    view.lineColor = tint
  }
}

/// The ring itself, as the backing of `RingLoader`.
final class RingLoaderView: UIView {
  /// One eased lap of the line.
  static let lap: CFTimeInterval = 0.9
  /// Ease in, ease out: quick through the middle of the lap, soft at both ends.
  static let curve = CAMediaTimingFunction(controlPoints: 0.65, 0, 0.35, 1)
  /// How far into the lap the tail sets off after the head; the line's stretch comes from it.
  static let tailDelay: Double = 0.1
  /// One turn of the slow drift under the laps, and of the steady turn under Reduce Motion.
  static let drift: CFTimeInterval = 2.4
  static let steady: CFTimeInterval = 1.2
  /// How much of the ring the line covers at rest.
  static let restLength: CGFloat = 0.24
  /// The line's path goes round twice, so its ends can travel a whole lap along it.
  private static let pathLaps: CGFloat = 2

  private static let animationKey = "ring-loader"

  var lineColor: UIColor = .white {
    didSet { if lineColor != oldValue { applyColors() } }
  }

  private let track = CAShapeLayer()
  /// Carries the drift; the line laps inside it.
  private let carrier = CALayer()
  private let line = CAShapeLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    commonInit()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    commonInit()
  }

  override var intrinsicContentSize: CGSize {
    CGSize(width: RingLoader.Size.regular.diameter, height: RingLoader.Size.regular.diameter)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let side = min(bounds.width, bounds.height)
    guard side > 0 else { return }
    // 4pt on the 36pt ring, never thinner than 2pt.
    let width = max(2, (side / 9).rounded(.toNearestOrAwayFromZero))
    let square = CGRect(x: bounds.midX - side / 2, y: bounds.midY - side / 2, width: side, height: side)
    let center = CGPoint(x: side / 2, y: side / 2)
    let radius = (side - width) / 2
    let ring = UIBezierPath(arcCenter: center, radius: radius, startAngle: -.pi / 2, endAngle: 1.5 * .pi, clockwise: true).cgPath
    // The resting tail is where the path begins, which puts the resting head at twelve o'clock.
    let tail = -.pi / 2 - 2 * .pi * Self.restLength
    let laps = UIBezierPath(arcCenter: center, radius: radius, startAngle: tail, endAngle: tail + 2 * .pi * Self.pathLaps, clockwise: true).cgPath
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    carrier.bounds = CGRect(origin: .zero, size: square.size)
    carrier.position = CGPoint(x: square.midX, y: square.midY)
    track.frame = square
    line.frame = carrier.bounds
    track.path = ring
    line.path = laps
    track.lineWidth = width
    line.lineWidth = width
    CATransaction.commit()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    window == nil ? stop() : restart()
  }

  private func commonInit() {
    backgroundColor = .clear
    isOpaque = false
    isUserInteractionEnabled = false
    track.fillColor = nil
    line.fillColor = nil
    line.lineCap = .round
    line.strokeStart = 0
    line.strokeEnd = Self.restLength / Self.pathLaps
    layer.addSublayer(track)
    carrier.addSublayer(line)
    layer.addSublayer(carrier)
    applyColors()
    registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: RingLoaderView, _) in view.applyColors() }
    // Core Animation drops running animations when the app leaves the foreground.
    for name in [UIApplication.willEnterForegroundNotification, UIAccessibility.reduceMotionStatusDidChangeNotification] {
      NotificationCenter.default.addObserver(self, selector: #selector(restart), name: name, object: nil)
    }
  }

  private func applyColors() {
    let color = lineColor.resolvedColor(with: traitCollection)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    track.strokeColor = color.withAlphaComponent(color.cgColor.alpha * 0.14).cgColor
    line.strokeColor = color.cgColor
    CATransaction.commit()
  }

  /// Whether the ring is turning right now; it only does while it is on screen.
  var isAnimating: Bool { carrier.animation(forKey: Self.animationKey) != nil }

  private func stop() {
    carrier.removeAnimation(forKey: Self.animationKey)
    line.removeAnimation(forKey: Self.animationKey)
  }

  @objc private func restart() {
    stop()
    guard window != nil else { return }
    let reduceMotion = UIAccessibility.isReduceMotionEnabled
    carrier.add(Self.turn(every: reduceMotion ? Self.steady : Self.drift), forKey: Self.animationKey)
    if !reduceMotion { line.add(Self.easedLap(), forKey: Self.animationKey) }
  }

  /// Both ends of the line travel one lap along the path on the same curve, the tail a beat
  /// behind the head. A lap further along the path is the same place on the ring, so the
  /// repeat is seamless.
  private static func easedLap() -> CAAnimation {
    let rest = restLength / pathLaps
    let lapLength = 1 / pathLaps
    let hold = CAMediaTimingFunction(name: .linear)

    let head = CAKeyframeAnimation(keyPath: "strokeEnd")
    head.values = [rest, rest + lapLength, rest + lapLength]
    head.keyTimes = [0, NSNumber(value: 1 - tailDelay), 1]
    head.timingFunctions = [curve, hold]

    let tail = CAKeyframeAnimation(keyPath: "strokeStart")
    tail.values = [0, 0, lapLength]
    tail.keyTimes = [0, NSNumber(value: tailDelay), 1]
    tail.timingFunctions = [hold, curve]

    let group = CAAnimationGroup()
    group.animations = [head, tail]
    group.duration = lap
    group.repeatCount = .infinity
    group.isRemovedOnCompletion = false
    return group
  }

  /// A constant turn: the drift under the laps, or the whole motion under Reduce Motion.
  private static func turn(every duration: CFTimeInterval) -> CAAnimation {
    let turn = CABasicAnimation(keyPath: "transform.rotation.z")
    turn.fromValue = 0
    turn.toValue = 2 * CGFloat.pi
    turn.duration = duration
    turn.timingFunction = CAMediaTimingFunction(name: .linear)
    turn.repeatCount = .infinity
    turn.isRemovedOnCompletion = false
    return turn
  }
}

#if DEBUG
#Preview("Ring loader") {
  VStack(spacing: 32) {
    RingLoader(size: .small)
    RingLoader()
    RingLoader(size: .large)
    RingLoader("Loading details", size: .regular).font(.footnote)
    RingLoader(size: .small, tint: .black)
      .frame(width: 200, height: 48)
      .background(.white, in: .capsule)
  }
  .frame(maxWidth: .infinity, maxHeight: .infinity)
  .background(Theme.background)
  .preferredColorScheme(.dark)
}
#endif
