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

    @State private var model: TorphMorphModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ text: AttributedString, cursorIndex: Int? = nil, options: TorphOptions = TorphOptions()) {
        value = text
        self.cursorIndex = cursorIndex
        self.options = options
        _model = State(initialValue: TorphMorphModel(seed: text, cursorIndex: cursorIndex, options: options))
    }

    public init(_ text: String, cursorIndex: Int? = nil, options: TorphOptions = TorphOptions()) {
        self.init(AttributedString(text), cursorIndex: cursorIndex, options: options)
    }

    /// A number formatted for you, so `options.locale` and `decimals` apply.
    public init(_ number: Double, decimals: Int = 0, options: TorphOptions = TorphOptions()) {
        let formatted = number.formatted(.number.precision(.fractionLength(decimals)).locale(options.locale))
        self.init(AttributedString(formatted), cursorIndex: nil, options: options)
    }

    private var plain: String { String(value.characters) }

    private var isDisabled: Bool {
        options.disabled || (options.respectReducedMotion && reduceMotion)
    }

    public var body: some View {
        Group {
            if isDisabled {
                Text(value)
                    .lineLimit(1)
            } else {
                TorphStage(model: model, options: options)
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
#endif
