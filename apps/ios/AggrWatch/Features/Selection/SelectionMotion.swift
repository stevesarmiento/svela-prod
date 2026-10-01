import SwiftUI

/// Disclosure transition shared by the swipe row and selection dock; timing comes from `Motion`.
enum SelectionMotion {
  static func disclose(anchor: UnitPoint, edge: Edge? = nil, reduceMotion: Bool) -> AnyTransition {
    if reduceMotion { return .identity }
    var insertion = AnyTransition.scale(scale: 0.7, anchor: anchor)
      .combined(with: AnyTransition(.blurReplace))
    var removal = AnyTransition.scale(scale: 0.85, anchor: anchor)
      .combined(with: AnyTransition(.blurReplace))
    if let edge {
      insertion = insertion.combined(with: .move(edge: edge))
      removal = removal.combined(with: .move(edge: edge))
    }
    return .asymmetric(insertion: insertion.animation(Motion.ui), removal: removal.animation(Motion.close))
  }
}
