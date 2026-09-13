import SwiftUI
import UIKit

/// Horizontal-only pan bridged from UIKit so the fight with the hosting
/// UIScrollView's pan is settled by UIKit's own arbitration — the mechanism
/// UITableView swipe actions rely on. A drag that is not clearly horizontal
/// FAILS before it ever begins, so the scroll view's pan proceeds as if this
/// recognizer did not exist and a row can never swallow a touch (the SwiftUI
/// DragGesture it replaces could win the touch before its axis was known,
/// then sit on it — the intermittent "scroll is blocked" feel).
///
/// Not a SwiftUI `Gesture`: attach with the dedicated `.gesture(_:)` overload
/// for representables; all state flows through the callbacks below.
struct TokenHorizontalPanGesture: UIGestureRecognizerRepresentable {
    /// Fired once with the initial translation (already past the intent
    /// threshold), so seed state here or the row jumps on the first change.
    var onBegan: (CGFloat) -> Void
    var onChanged: (CGFloat) -> Void
    /// Final translation (pt) plus horizontal velocity (pt/s).
    var onEnded: (_ translation: CGFloat, _ velocity: CGFloat) -> Void
    /// UIKit cancelled/failed a pan that had begun (system gesture, call…).
    var onCancelled: () -> Void
    /// A finger is on the view: down, or swiping it. Clears on lift, cancel,
    /// or when the scroll view takes the touch. Observed from the recognizer's
    /// raw touches, so it never competes with the scroll view or child
    /// buttons the way a SwiftUI long press does.
    var onPressChanged: (Bool) -> Void = { _ in }

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator {
        Coordinator()
    }

    func makeUIGestureRecognizer(context: Context) -> TokenHorizontalPanRecognizer {
        let pan = TokenHorizontalPanRecognizer()
        pan.maximumNumberOfTouches = 1
        // Defaults kept on purpose: cancelsTouchesInView = true (a real swipe
        // should cancel a pressed Button), delaysTouchesBegan = false (true
        // would delay every Button highlight on the card).
        pan.delegate = context.coordinator
        pan.onPressChanged = onPressChanged
        return pan
    }

    func updateUIGestureRecognizer(_ recognizer: TokenHorizontalPanRecognizer, context: Context) {
        // Re-bind so the closure never captures a stale view value.
        recognizer.onPressChanged = onPressChanged
    }

    func handleUIGestureRecognizerAction(_ recognizer: TokenHorizontalPanRecognizer, context: Context) {
        // Recognizer-space values: the x axis matches the row's and they are
        // non-optional, unlike the converter's.
        let x = recognizer.translation(in: recognizer.view).x
        switch recognizer.state {
        case .began:
            onBegan(x)
        case .changed:
            onChanged(x)
        case .ended:
            onEnded(x, recognizer.velocity(in: recognizer.view).x)
        case .cancelled, .failed:
            onCancelled()
        default:
            break
        }
    }

    // Nested types don't inherit the struct's isolation, and the delegate
    // protocol is main-actor under Swift 6.
    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        /// Editable controls inside a token card may pan
        /// horizontally too — never take their touches. Only while enabled,
        /// so a disabled slider in selection mode still lets a right swipe
        /// select the row.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view = touch.view
            while let current = view, current !== gestureRecognizer.view {
                if let control = current as? UIControl, control.isEnabled { return false }
                view = current.superview
            }
            return true
        }
    }
}

/// A pan that decides its axis from the raw touch before UIKit is allowed to
/// begin it. `gestureRecognizerShouldBegin` is consulted too early to judge
/// direction (the reported translation can still be zero), so the gate lives
/// in `touchesMoved`: hold in `.possible` until the finger has moved 10 pt,
/// then either fail outright (vertical/diagonal — the scroll view takes over)
/// or start feeding the superclass (clearly horizontal).
final class TokenHorizontalPanRecognizer: UIPanGestureRecognizer {
    var onPressChanged: ((Bool) -> Void)?

    private var start: CGPoint?
    private var decided = false
    private var pressed = false {
        didSet { if pressed != oldValue { onPressChanged?(pressed) } }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        if start == nil, let touch = touches.first {
            let point = touch.location(in: nil)
            // Leave the system's back gesture alone at either window edge.
            if let window = view?.window, point.x < 24 || point.x > window.bounds.width - 24 {
                state = .failed
                return
            }
            start = point
        }
        pressed = true
        super.touchesBegan(touches, with: event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        if !decided, let start, let touch = touches.first {
            let point = touch.location(in: nil)
            let dx = point.x - start.x
            let dy = point.y - start.y
            // Not enough movement to know the intent yet: stay possible and
            // don't let the superclass begin on a wobble.
            let intent = TokenSwipeRules.intent(dx: dx, dy: dy)
            guard intent != .pending else { return }
            decided = true
            if intent == .scroll {
                // Scroll takes over; reset() clears the press.
                state = .failed
                return
            }
            // Horizontal: the press stays lit for the whole swipe.
        }
        guard state != .failed else { return }
        super.touchesMoved(touches, with: event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        pressed = false
        super.touchesEnded(touches, with: event)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        pressed = false
        super.touchesCancelled(touches, with: event)
    }

    override func reset() {
        super.reset()
        start = nil
        decided = false
        pressed = false
    }
}
