import SwiftUI

/// Aufn's disclosure timing, shared by the swipe row and selection dock.
enum SelectionMotion {
  static let open: Animation = .spring(duration: 0.28, bounce: 0.3)
  static let close: Animation = .easeOut(duration: 0.16)

  static func disclose(anchor: UnitPoint, edge: Edge? = nil, reduceMotion: Bool) -> AnyTransition {
    if reduceMotion { return .opacity.animation(.easeOut(duration: 0.16)) }
    var insertion = AnyTransition.scale(scale: 0.7, anchor: anchor)
      .combined(with: AnyTransition(.blurReplace))
    var removal = AnyTransition.scale(scale: 0.85, anchor: anchor)
      .combined(with: AnyTransition(.blurReplace))
    if let edge {
      insertion = insertion.combined(with: .move(edge: edge))
      removal = removal.combined(with: .move(edge: edge))
    }
    return .asymmetric(insertion: insertion.animation(open), removal: removal.animation(close))
  }
}
