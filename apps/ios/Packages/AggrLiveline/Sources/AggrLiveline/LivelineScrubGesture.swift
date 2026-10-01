import CoreGraphics
import Foundation

/// Decides when a touch on the chart becomes a scrub instead of a scroll.
///
/// A scrub starts when the finger holds still for `holdDelay`, or when it travels
/// `commitDistance` mostly horizontally. Until then the touch is `pending` and the enclosing
/// scroll view may take it. Pure value type so the policy is testable without UIKit touches.
struct LivelineScrubGesture {
  enum Phase: Equatable {
    case idle
    case pending
    case scrubbing
  }

  enum Decision: Equatable {
    case none
    case start(x: CGFloat)
    case update(x: CGFloat)
    case end
  }

  /// Hold-still duration before a stationary finger starts scrubbing.
  static let holdDelay: TimeInterval = 0.075
  /// Travel tolerated during the hold so a jittery finger still counts as still.
  static let holdSlop: CGFloat = 4
  /// Horizontal travel that commits a moving finger to a scrub.
  static let commitDistance: CGFloat = 15
  /// Horizontal travel must exceed vertical travel by this factor to commit.
  static let horizontalBias: CGFloat = 1.1

  private(set) var phase: Phase = .idle
  private(set) var startLocation: CGPoint = .zero
  private(set) var lastLocation: CGPoint = .zero

  var isScrubbing: Bool { phase == .scrubbing }

  mutating func began(at point: CGPoint) -> Decision {
    phase = .pending
    startLocation = point
    lastLocation = point
    return .none
  }

  mutating func moved(to point: CGPoint) -> Decision {
    lastLocation = point
    switch phase {
    case .idle:
      return .none
    case .scrubbing:
      return .update(x: point.x)
    case .pending:
      let dx = abs(point.x - startLocation.x)
      let dy = abs(point.y - startLocation.y)
      if dx > Self.commitDistance, dx > dy * Self.horizontalBias {
        phase = .scrubbing
        return .start(x: point.x)
      }
      return .none
    }
  }

  mutating func holdTimerFired() -> Decision {
    guard phase == .pending else { return .none }
    let dx = abs(lastLocation.x - startLocation.x)
    let dy = abs(lastLocation.y - startLocation.y)
    guard max(dx, dy) < Self.holdSlop else { return .none }
    phase = .scrubbing
    return .start(x: lastLocation.x)
  }

  mutating func ended() -> Decision {
    let wasScrubbing = phase == .scrubbing
    phase = .idle
    return wasScrubbing ? .end : .none
  }

  /// Whether an ancestor pan (scroll view, pull-to-dismiss) may begin. Refused mid-scrub and
  /// for horizontal motion, which is scrub territory; vertical motion scrolls.
  func shouldAllowPan(velocity: CGPoint) -> Bool {
    if phase == .scrubbing { return false }
    return abs(velocity.y) > abs(velocity.x)
  }
}
