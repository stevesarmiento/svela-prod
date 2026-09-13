import CoreGraphics

/// Pure geometry for the two-directional swipe row: how far a row may travel
/// in each direction, how the revealed panel and its icon grow, and what a
/// release means. Kept SwiftUI/UIKit-free so the thresholds are testable the
/// same way `TransportRules` is.
enum TokenSwipeRules {
    enum Intent: Equatable { case pending, horizontal, scroll }
    static func intent(dx: CGFloat, dy: CGFloat) -> Intent {
        guard hypot(dx, dy) >= 10 else { return .pending }
        return abs(dx) > abs(dy) * 1.5 ? .horizontal : .scroll
    }

    /// Travel at which a panel is fully revealed and a release commits (select
    /// toggles, delete asks). Short on purpose — a thumb-flick, not a haul.
    static let revealWidth: CGFloat = 56
    /// Extra panel width hidden under the card so its rounded corner never
    /// shows a gap between card and panel.
    static let panelTuck: CGFloat = 16

    enum Outcome: Equatable {
        case close
        case commitDelete
        case toggleSelect
    }

    /// Free in a direction that can act (up to the reveal, then rubber-banded
    /// /4 so the card never slides far), rubber-banded /4 outright otherwise.
    /// A right drag from an OPEN removal row (`base < 0`) still rubber-bands
    /// past zero so "close delete" and "select" can never happen in one gesture.
    static func offset(base: CGFloat, translation: CGFloat, canDelete: Bool, canSelect: Bool) -> CGFloat {
        let x = base + translation
        if x > 0 {
            guard canSelect && base == 0 else { return x / 4 }
            return clampPastReveal(x)
        }
        guard canDelete else { return x / 4 }
        return clampPastReveal(x)
    }

    /// Beyond the reveal the card only creeps: reveal + excess/4.
    static func clampPastReveal(_ x: CGFloat) -> CGFloat {
        let magnitude = abs(x)
        guard magnitude > revealWidth else { return x }
        let clamped = revealWidth + (magnitude - revealWidth) / 4
        return x < 0 ? -clamped : clamped
    }

    /// The revealed panel: the visible travel plus the part tucked under the card.
    static func panelWidth(travel: CGFloat) -> CGFloat {
        max(0, travel) + panelTuck
    }

    /// How far the panel has gone from its resting dark grey to its action
    /// colour: 0 closed, 1 at the full reveal.
    static func fillProgress(travel: CGFloat) -> CGFloat {
        min(1, max(0, travel / revealWidth))
    }

    /// What a release means, judged on RAW finger travel (before clamping) and
    /// never on the predicted end, so a scroll-adjacent flick can't act. Both
    /// directions commit at the full reveal; there is no resting open state.
    static func outcome(
        base: CGFloat,
        translation: CGFloat,
        canDelete: Bool,
        canSelect: Bool
    ) -> Outcome {
        let dragged = base + translation
        if dragged > 0 {
            return (canSelect && base == 0 && dragged >= revealWidth) ? .toggleSelect : .close
        }
        guard canDelete else { return .close }
        return dragged <= -revealWidth ? .commitDelete : .close
    }
}
