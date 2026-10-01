#if canImport(UIKit)
import SwiftUI

/// The look of one segment at one instant: how far its glyph has slid inside its slot (in slot
/// heights), how much it is scaled, and how opaque it is.
struct SegmentVisual: Equatable {
    var slide: Double = 0
    var scale: Double = 1
    var opacity: Double = 1

    static let identity = SegmentVisual()
}

/// Remembers what a segment looked like last frame, so a morph that interrupts it starts from
/// there rather than snapping — torph's `cancelAnimations` snapshot.
final class SegmentCarry {
    var generation = -1
    var start = SegmentVisual.identity
    var startProgress = 0.0
    var last = SegmentVisual.identity
}

/// torph's per-element animation tables (`animate.ts`, `number-animate.ts`, `replace-animate.ts`)
/// evaluated from the shared clock. Slides run on the eased progress; fades are linear in *time*,
/// recovered by inverting the curve, and last a share of the morph rather than a fixed length.
struct SegmentEffects: ViewModifier {
    let info: SegmentInfo
    let generation: Int
    let ease: TorphEase
    let scaleEnabled: Bool
    let slotFadeEm: CGFloat

    @Environment(\.torphProgress) private var progress
    @State private var carry = SegmentCarry()

    private static let textScale = 0.95
    private static let groupScale = 0.8

    func body(content: Content) -> some View {
        let visual = currentVisual()
        content
            .visualEffect { view, proxy in
                view.offset(y: CGFloat(visual.slide) * proxy.size.height)
            }
            .scaleEffect(visual.scale)
            .opacity(visual.opacity)
            .modifier(SlotClip(enabled: info.kind != nil, fadeEm: slotFadeEm))
    }

    private func currentVisual() -> SegmentVisual {
        if carry.generation != generation {
            carry.start = carry.last
            carry.startProgress = min(progress, Double(generation))
            carry.generation = generation
        }
        let p = torphNormalizedProgress(progress, start: carry.startProgress, generation: generation)
        let slideP = torphOvershootProgress(progress, start: carry.startProgress, generation: generation)
        let t = ease.timeFraction(atProgress: p)
        let visual = Self.visual(role: info.role, kind: info.kind, from: carry.start, p: p, slideP: slideP, t: t, scaleEnabled: scaleEnabled)
        carry.last = visual
        return visual
    }

    static func visual(
        role: MorphPlan.Role,
        kind: SegmentKind?,
        from start: SegmentVisual,
        p: Double,
        slideP: Double,
        t: Double,
        scaleEnabled: Bool
    ) -> SegmentVisual {
        // A fully opaque element has no fade to carry; it is a fresh arrival.
        let arrivalOpacity = start.opacity >= 1 ? 0 : start.opacity

        switch role {
        case .persist:
            // An interrupted arrival keeps fading in; everything else is already at rest.
            return SegmentVisual(
                slide: mix(start.slide, 0, p),
                scale: mix(start.scale, 1, p),
                opacity: mix(start.opacity, 1, window(t, 0, 0.25))
            )

        case .enter:
            if let kind {
                // Digits arrive from above, separators from below, so each reads as its own event.
                let from = start.slide + (kind == .digit ? -1 : 1)
                return SegmentVisual(
                    slide: mix(from, 0, slideP),
                    scale: 1,
                    opacity: mix(arrivalOpacity, 1, window(t, 0, 0.25))
                )
            }
            let fromScale = start.scale >= 1 ? textScale : start.scale
            return SegmentVisual(
                slide: 0,
                scale: mix(fromScale, 1, p),
                opacity: mix(arrivalOpacity, 1, window(t, 0.25, 0.75))
            )

        case .exit:
            if kind != nil {
                // The outgoing share is larger because a digit that has already left is a hole in the number.
                return SegmentVisual(
                    slide: mix(start.slide, 1, slideP),
                    scale: 1,
                    opacity: mix(start.opacity, 0, window(t, 0, 0.45))
                )
            }
            return SegmentVisual(
                slide: 0,
                scale: scaleEnabled ? mix(start.scale, textScale, p) : start.scale,
                opacity: mix(start.opacity, 0, window(t, 0, 0.25))
            )

        case .groupExit:
            // Deeper than a character's 0.95, so the run reads as receding, not as a glyph settling.
            return SegmentVisual(
                slide: 0,
                scale: mix(start.scale, groupScale, p),
                opacity: mix(start.opacity, 0, window(t, 0, 0.45))
            )

        case .groupEnter:
            let fromScale = start.scale >= 1 ? groupScale : start.scale
            return SegmentVisual(
                slide: 0,
                scale: mix(fromScale, 1, p),
                opacity: mix(arrivalOpacity, 1, window(t, 0, 0.35))
            )
        }
    }

    private static func mix(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

    /// Linear ramp over a time window, clamped.
    private static func window(_ t: Double, _ start: Double, _ end: Double) -> Double {
        guard end > start else { return t >= end ? 1 : 0 }
        return min(max((t - start) / (end - start), 0), 1)
    }
}

/// A digit slides a whole line box to arrive, so it needs its own box to hide behind. The clip is
/// on the block axis only — the inline axis stays open so glyph overhang is not shaved — and its
/// edges are softened into a short gradient, as torph's mask does. The gradient sits just outside
/// the slot rather than eating into it, so a comma's tail is never dimmed at rest.
///
/// Always applied, even to plain text (as an open mask): swapping a mask in and out when a segment
/// changes kind would be a structural change inside the morph's transaction, and SwiftUI would
/// crossfade the glyph with itself.
struct SlotClip: ViewModifier {
    let enabled: Bool
    let fadeEm: CGFloat

    func body(content: Content) -> some View {
        content.mask(alignment: .center) { SlotMask(enabled: enabled, fadeEm: fadeEm) }
    }
}

private struct SlotMask: View {
    let enabled: Bool
    let fadeEm: CGFloat

    /// Far enough that an open mask never meets a glyph. One view either way: a branch here would
    /// crossfade the mask itself when a segment changes kind.
    private static let openMargin: CGFloat = 4_000

    var body: some View {
        GeometryReader { geometry in
            let height = max(geometry.size.height, 1)
            let width = geometry.size.width
            // The slot is one line box; the font's em is close to its height over the line spacing.
            let fade = enabled ? fadeEm * height / 1.2 : Self.openMargin / 2
            let total = height + 2 * fade
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: fade / total),
                    .init(color: .black, location: 1 - fade / total),
                    .init(color: .clear, location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: width + Self.openMargin, height: total)
            .position(x: width / 2, y: height / 2)
        }
    }
}
#endif
