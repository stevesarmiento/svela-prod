#if canImport(UIKit)
import SwiftUI

/// One segment on screen. Font, colour and line limit come from the caller's environment, like `Text`.
struct SegmentView: View {
    let item: MorphPlan.Item
    let text: AttributedString
    let generation: Int
    let options: TorphOptions

    var body: some View {
        let info = SegmentInfo(key: item.key, role: item.role, kind: item.segment.kind, isNewline: item.segment.isNewline)
        Group {
            if item.segment.isNewline {
                Color.clear.frame(width: 0, height: 0)
            } else {
                Text(text)
                    .lineLimit(1)
                    .fixedSize()
                    // A font step mid-morph (the amount card's size ladder) interpolates the glyph.
                    .contentTransition(.interpolate)
                    .modifier(SegmentEffects(
                        info: info,
                        generation: generation,
                        ease: options.ease,
                        scaleEnabled: options.scale
                    ))
            }
        }
        .layoutValue(key: SegmentInfoKey.self, value: info)
        .accessibilityHidden(true)
    }
}

/// The layout plus its segments, rebuilt each frame by the clock above it.
struct TorphStage: View {
    let model: TorphMorphModel
    let value: AttributedString
    let cursorIndex: Int?
    let options: TorphOptions

    var body: some View {
        model.seedIfNeeded(value, cursorIndex: cursorIndex, options: options)
        return TorphLayout(
            generation: model.generation,
            progress: Double(model.generation),
            isEmptyTransition: model.isEmptyTransition,
            exitRuns: model.exitRuns,
            enterRuns: model.enterRuns
        ) {
            ForEach(model.rendered) { item in
                SegmentView(
                    item: item,
                    text: model.slices[item.key] ?? AttributedString(item.segment.string),
                    generation: model.generation,
                    options: options
                )
            }
        }
        .modifier(SlotClip(fadeEm: options.slotFadeEm))
    }
}
#endif
