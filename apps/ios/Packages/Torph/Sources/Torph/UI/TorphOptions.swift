#if canImport(UIKit)
import SwiftUI

/// Configuration for `TorphText`, mirroring torph's `TextMorphOptions`.
public struct TorphOptions: Equatable {
    /// The curve the morph runs on. A spring settles on its own physics and ignores `duration`.
    public var ease: TorphEase = .standard
    /// Seconds, for curve easings. torph's default is 400 ms.
    public var duration: TimeInterval = 0.4
    /// Morph numeric words by place value. Off falls back to the character-level text morph.
    public var numbers = true
    /// Scale exiting/entering text segments slightly (0.95), as torph does.
    public var scale = true
    /// Locale for word segmentation, the decimal separator, and numeric formatting.
    public var locale = Locale(identifier: "en")
    /// Disable all morphing: the value is swapped as plain text.
    public var disabled = false
    /// Plain swap when the system Reduce Motion setting is on.
    public var respectReducedMotion = true
    /// Height of the soft edge on a digit slot's vertical clip, in ems.
    public var slotFadeEm: CGFloat = 0.15
    public var onAnimationStart: (() -> Void)?
    public var onAnimationComplete: (() -> Void)?
    /// A morph interrupted by the next one. Exactly one of complete/cancel runs per morph.
    public var onAnimationCancel: (() -> Void)?

    public init() {}

    public init(
        ease: TorphEase = .standard,
        duration: TimeInterval = 0.4,
        numbers: Bool = true,
        scale: Bool = true,
        locale: Locale = Locale(identifier: "en"),
        disabled: Bool = false,
        respectReducedMotion: Bool = true
    ) {
        self.ease = ease
        self.duration = duration
        self.numbers = numbers
        self.scale = scale
        self.locale = locale
        self.disabled = disabled
        self.respectReducedMotion = respectReducedMotion
    }

    /// Callbacks are left out, like torph's `serializeConfig`: changing one must not restart the morph.
    public static func == (lhs: TorphOptions, rhs: TorphOptions) -> Bool {
        lhs.ease == rhs.ease && lhs.duration == rhs.duration && lhs.numbers == rhs.numbers && lhs.scale == rhs.scale
            && lhs.locale == rhs.locale && lhs.disabled == rhs.disabled && lhs.respectReducedMotion == rhs.respectReducedMotion
            && lhs.slotFadeEm == rhs.slotFadeEm
    }

    var resolvedDuration: TimeInterval { ease.resolvedDuration(fallback: duration) }
}

extension TorphEase {
    /// The SwiftUI animation that drives the morph clock.
    func animation(duration: TimeInterval) -> Animation {
        switch self {
        case .linear:
            return .linear(duration: duration)
        case .cubicBezier(let x1, let y1, let x2, let y2):
            return .timingCurve(x1, y1, x2, y2, duration: duration)
        case .spring(let stiffness, let damping, let mass):
            return .spring(Spring(mass: mass, stiffness: stiffness, damping: damping, allowOverDamping: true))
        }
    }
}
#endif
