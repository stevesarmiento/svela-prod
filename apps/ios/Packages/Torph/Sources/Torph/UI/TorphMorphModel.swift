#if canImport(UIKit)
import SwiftUI

/// Drives one `TorphText`: runs the engine on each new value and owns the animation clock.
@Observable
@MainActor
final class TorphMorphModel {
    /// Everything on screen, exiters first.
    private(set) var rendered: [MorphPlan.Item] = []
    /// The per-segment styled text, keyed by segment id. Exiters keep the slice they had.
    private(set) var slices: [String: AttributedString] = [:]
    /// Ticks once per morph; the clock interpolates towards it.
    private(set) var generation = 0
    private(set) var isEmptyTransition = false
    private(set) var exitRuns: [[String]] = []
    private(set) var enterRuns: [[String]] = []

    @ObservationIgnored private var state = TorphMorphState()
    @ObservationIgnored private var lastPlain: String?
    @ObservationIgnored private var inFlight = false
    @ObservationIgnored private var seed: (value: AttributedString, cursorIndex: Int?, options: TorphOptions)?

    init() {}

    /// The first value, applied on the first render instead of from `onChange`. Setting observed
    /// state from `onChange` after the stage has drawn its empty self forces a second synchronous
    /// SwiftUI pass per text; with many texts appearing at once that added up to a sixth of the
    /// main-thread time of an account switch. The plan is only built when the stage first asks,
    /// so a parent re-rendering (and re-initialising its `TorphText`) pays nothing here.
    init(seed value: AttributedString, cursorIndex: Int?, options: TorphOptions) {
        seed = (value, cursorIndex, options)
    }

    /// Applies the seed if it is still pending. Safe inside the stage's body: nothing observes the
    /// rendered items before their first read.
    func seedIfNeeded() {
        guard let seed else { return }
        self.seed = nil
        let plain = String(seed.value.characters)
        lastPlain = plain
        let plan = state.update(plain, cursorIndex: seed.cursorIndex, locale: seed.options.locale, numbers: seed.options.numbers)
        apply(plan, slices: Self.slice(seed.value, for: plan.live))
    }

    func update(_ value: AttributedString, cursorIndex: Int?, options: TorphOptions) {
        seedIfNeeded()
        let plain = String(value.characters)
        if plain == lastPlain { return }
        lastPlain = plain

        let wasInitial = state.isInitial
        let plan = state.update(plain, cursorIndex: cursorIndex, locale: options.locale, numbers: options.numbers)
        var next = slices.filter { key, _ in plan.items.contains { $0.key == key } }
        for (key, slice) in Self.slice(value, for: plan.live) { next[key] = slice }

        if wasInitial {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { apply(plan, slices: next) }
            return
        }

        if inFlight { options.onAnimationCancel?() }
        options.onAnimationStart?()
        inFlight = true

        let target = generation + 1
        let animation = options.ease.animation(duration: options.resolvedDuration)
        withAnimation(animation, completionCriteria: .logicallyComplete) {
            apply(plan, slices: next)
            generation = target
        } completion: { [weak self] in
            guard let self, self.generation == target else { return }
            self.finish()
            options.onAnimationComplete?()
        }
    }

    /// The value is shown as plain text now; the next update starts from scratch.
    func reset() {
        seed = nil
        state.reset()
        lastPlain = nil
        inFlight = false
        rendered = []
        slices = [:]
    }

    private func apply(_ plan: MorphPlan, slices next: [String: AttributedString]) {
        rendered = plan.items
        slices = next
        isEmptyTransition = plan.isEmptyTransition
        exitRuns = plan.exitRuns
        enterRuns = plan.enterRuns
    }

    private func finish() {
        inFlight = false
        let exited = Set(rendered.filter { $0.role.isExit }.map(\.key))
        guard !exited.isEmpty else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            rendered.removeAll { exited.contains($0.key) }
            for key in exited { slices[key] = nil }
        }
        state.removeExited(exited)
    }

    /// Maps each live segment onto its run of the styled input by cumulative character offsets.
    /// The engine substitutes a no-break space for spaces inside numbers and adds a zero-width
    /// stand-in for an empty value, so the walk goes by the segment's character count, not its text.
    static func slice(_ value: AttributedString, for segments: [Segment]) -> [String: AttributedString] {
        var out: [String: AttributedString] = [:]
        let chars = value.characters
        var cursor = chars.startIndex
        for segment in segments {
            if segment.id == Segment.emptyID {
                out[segment.id] = AttributedString(Segment.emptyPlaceholder)
                continue
            }
            let count = segment.string.count
            guard let end = chars.index(cursor, offsetBy: count, limitedBy: chars.endIndex) else {
                out[segment.id] = AttributedString(segment.string)
                continue
            }
            let run = AttributedString(value[cursor..<end])
            if segment.isSpace || segment.isNewline {
                var text = AttributedString(segment.string)
                if let attributes = run.runs.first?.attributes { text.setAttributes(attributes) }
                out[segment.id] = text
            } else {
                out[segment.id] = run
            }
            cursor = end
        }
        return out
    }
}
#endif
