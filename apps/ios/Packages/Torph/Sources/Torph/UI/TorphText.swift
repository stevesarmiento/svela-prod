#if canImport(UIKit)
import SwiftUI

/// Text that morphs between values instead of swapping: words and characters that persist slide to
/// their new place, numbers roll by place value, and a field being typed into follows the caret.
///
/// Style it like `Text`: `.font`, `.foregroundStyle` and `.lineLimit` on the outside apply to every
/// segment. Per-character colours come through the `AttributedString` initialiser.
///
/// - Parameters:
///   - cursorIndex: The caret position in the new value. Switches a single number from place
///     matching to caret matching; pass `text.count` for a field that always edits at its end.
///   - options: Motion and matching options. Defaults match torph.
public struct TorphText: View {
    private let value: AttributedString
    private let cursorIndex: Int?
    private let options: TorphOptions

    // `StateObject` takes its initial value lazily, so a parent re-rendering (and re-initialising
    // its `TorphText`) allocates nothing here; the model is built once per view identity and
    // seeded by the stage on its first render.
    @StateObject private var holder = TorphModelHolder()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ text: AttributedString, cursorIndex: Int? = nil, options: TorphOptions = TorphOptions()) {
        value = text
        self.cursorIndex = cursorIndex
        self.options = options
    }

    public init(_ text: String, cursorIndex: Int? = nil, options: TorphOptions = TorphOptions()) {
        self.init(AttributedString(text), cursorIndex: cursorIndex, options: options)
    }

    /// A number formatted for you, so `options.locale` and `decimals` apply.
    public init(_ number: Double, decimals: Int = 0, options: TorphOptions = TorphOptions()) {
        let formatted = number.formatted(.number.precision(.fractionLength(decimals)).locale(options.locale))
        self.init(AttributedString(formatted), cursorIndex: nil, options: options)
    }

    private var isDisabled: Bool {
        options.disabled || (options.respectReducedMotion && reduceMotion)
    }

    public var body: some View {
        let plain = String(value.characters)
        let model = holder.model
        return Group {
            if isDisabled {
                Text(value)
                    .lineLimit(1)
            } else {
                TorphStage(model: model, value: value, cursorIndex: cursorIndex, options: options)
                    .modifier(TorphClock(animatableData: Double(model.generation)))
                    .onChange(of: plain, initial: true) { _, _ in
                        model.update(value, cursorIndex: cursorIndex, options: options)
                    }
                    .onChange(of: options) { _, _ in
                        // A new configuration starts over, as torph re-creates its instance.
                        model.reset()
                        model.update(value, cursorIndex: cursorIndex, options: options)
                    }
            }
        }
        .onChange(of: isDisabled) { _, disabled in
            if disabled { model.reset() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(plain))
    }
}

/// Owns a `TorphMorphModel` for one `TorphText` identity. The model itself is `@Observable`; this
/// wrapper only exists for `StateObject`'s lazy initial value.
@MainActor
private final class TorphModelHolder: ObservableObject {
    let model = TorphMorphModel()
}
#endif
