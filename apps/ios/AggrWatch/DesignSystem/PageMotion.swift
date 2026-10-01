import SwiftUI

/// Cross-fades a page in or out with a slight scale, so two mounted pages read as a zoom-through.
/// `distanceAboveCenter` offsets content that lives above the page's scale pivot.
struct PageMotion: ViewModifier {
  let visible: Bool
  let hiddenScale: CGFloat
  var distanceAboveCenter: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    let scale = visible || reduceMotion ? 1 : hiddenScale
    content
      .scaleEffect(scale)
      .offset(y: -distanceAboveCenter * (scale - 1))
      .opacity(visible ? 1 : 0)
      .allowsHitTesting(visible)
      .accessibilityHidden(!visible)
  }
}

nonisolated enum PageTransition {
  static let duration: TimeInterval = 0.24
  static let outgoingScale: CGFloat = 1.055
  static let incomingScale: CGFloat = 0.98
  static let controlPoint1 = CGPoint(x: 0.2, y: 0.8)
  static let controlPoint2 = CGPoint(x: 0.2, y: 1)

  /// The shared grid ↔ detail curve; nil under Reduce Motion.
  static func animation(reduceMotion: Bool) -> Animation? {
    reduceMotion ? nil : .timingCurve(
      controlPoint1.x, controlPoint1.y, controlPoint2.x, controlPoint2.y, duration: duration
    )
  }
}
