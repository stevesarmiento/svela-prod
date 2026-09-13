import SwiftUI

/// Two-directional swipe row for cards hosted in a ScrollView (no List, so no
/// system swipeActions). The card slides and reveals a solid panel with the
/// same rounded-rect shape, full row height, tucked under the card so the pair
/// reads as one continuous shape — with just an icon, no caption.
///
/// Swipe LEFT deletes (red, trash): releasing once the panel is fully
/// revealed asks through a confirmation alert; the row stays revealed while
/// the alert is up and springs back when it closes. No resting open state.
///
/// Swipe RIGHT selects (accent, checklist): releasing once the panel is fully
/// revealed toggles the row and it springs back closed. Neither panel is a
/// Button — release is the commit.
///
/// A finger resting on the card lightens it (a press state), so a tap reads
/// as landing on the card before anything happens.
///
/// While the parent has a selection ("selection mode") the left swipe goes
/// inert (delete lives in the action bar), the card's own controls are
/// disabled, and a tap anywhere on the card toggles it.
///
/// The drag is a UIKit pan (`TokenHorizontalPanGesture`) so UIKit arbitrates it
/// against the ScrollView: anything not clearly horizontal never begins and
/// scrolls normally. `openRowID` marks the row currently showing its delete
/// alert (revealed), so exactly one row is ever armed.
struct TokenSwipeCard<Content: View>: View {
    let id: String
    @Binding var openRowID: String?
    var isSelected = false
    var inSelectionMode = false
    var onToggleSelection: () -> Void = {}
    let deleteTitle: String
    var deleteButtonTitle: String = "Remove token"
    var deleteMessage: String = "If this is the token’s last watchlist, its saved holdings will also be cleared."
    var deleteAccessibilityLabel: String = "Remove from watchlist"
    var onDelete: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var layoutDirection
    private var direction: CGFloat { layoutDirection == .leftToRight ? 1 : -1 }
    private var openAnimation: Animation? { reduceMotion ? nil : SelectionMotion.open }
    private var closeAnimation: Animation? { reduceMotion ? nil : SelectionMotion.close }

    @State private var translation: CGFloat = 0
    @State private var confirmingDelete = false
    /// Driven by the pan recognizer's raw touches: true from touch-down through
    /// a swipe; false on lift, cancel, or when the scroll takes the touch.
    @State private var isPressed = false

    private var canDelete: Bool { onDelete != nil && !inSelectionMode }
    private var isOpen: Bool { openRowID == id }
    private var baseOffset: CGFloat { isOpen ? -TokenSwipeRules.revealWidth : 0 }
    private var offset: CGFloat {
        TokenSwipeRules.offset(base: baseOffset, translation: translation, canDelete: canDelete, canSelect: true)
    }
    private var deleteTravel: CGFloat { max(0, -offset) }
    private var selectTravel: CGFloat { max(0, offset) }
    /// The finger has crossed the point where release commits.
    private var selectArmed: Bool { offset >= TokenSwipeRules.revealWidth }
    private var deleteArmed: Bool { offset <= -TokenSwipeRules.revealWidth }

    var body: some View {
        content()
            // Chips and sliders go quiet in selection mode; the pan below is
            // attached OUTSIDE this subtree so the right swipe keeps working.
            .disabled(inSelectionMode)
            .overlay {
                // Conditional child, not a conditional modifier chain: the
                // content keeps its identity (mixer state, peaks task) when
                // entering and leaving the mode.
                if inSelectionMode {
                    Color.clear
                        .contentShape(.rect(cornerRadius: 16))
                        .onTapGesture {
                            withAnimation(reduceMotion ? nil : .snappy) { toggleSelection() }
                        }
                }
            }
            // Press state: a touch resting on the card lightens it.
            .overlay {
                Color.white.opacity(isPressed ? 0.07 : 0)
                    .clipShape(.rect(cornerRadius: 16))
                    .allowsHitTesting(false)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isPressed)
            }
            // TrackCard's fill is 6% white over black; without an opaque
            // backing the panel tucked underneath would tint the card.
            .background(.black, in: .rect(cornerRadius: 16))
            .offset(x: offset * direction)
            .gesture(pan)
            // Panels are backgrounds attached AFTER the offset: sized to the
            // card's own layout frame (full row height) and they stay put
            // while the card slides over them.
            .background(alignment: .trailing) {
                if deleteTravel > 0.5 && canDelete {
                    deletePanel
                }
            }
            .background(alignment: .leading) {
                if selectTravel > 0.5 {
                    selectPanel
                }
            }
            .sensoryFeedback(trigger: selectArmed) { _, armed in
                armed ? .impact(weight: .medium, intensity: 1) : nil
            }
            .sensoryFeedback(trigger: deleteArmed) { _, armed in
                armed ? .impact(weight: .medium, intensity: 1) : nil
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: isSelected)
            .sensoryFeedback(trigger: confirmingDelete) { _, showing in
                showing ? .warning : nil
            }
            .accessibilityAddTraits(isSelected ? .isSelected : [])
            .accessibilityAction(named: Text(isSelected ? "Deselect" : "Select")) {
                withAnimation(reduceMotion ? nil : .snappy) { toggleSelection() }
            }
            .accessibilityActions {
                if canDelete { Button(deleteAccessibilityLabel) { confirmingDelete = true } }
            }
            .alert(deleteTitle, isPresented: $confirmingDelete) {
                Button("Cancel", role: .cancel) {}
                Button(deleteButtonTitle, role: .destructive) { onDelete?() }
            } message: {
                Text(deleteMessage)
            }
            .onChange(of: inSelectionMode) { _, active in
                if active {
                    withAnimation(closeAnimation) { translation = 0; openRowID = nil }
                }
            }
            .onDisappear { if isOpen { openRowID = nil } }
            .onChange(of: confirmingDelete) { _, showing in
                // Cancel/dismiss: don't leave the row sitting armed.
                if !showing && isOpen {
                    withAnimation(closeAnimation) { openRowID = nil }
                }
            }
    }

    /// Panels rest dark grey and take their action colour as the drag
    /// completes, so "fully dragged" is visible before the finger lifts.
    private var restingFill: Color { Color(white: 0.22) }

    /// Grey → red. Indicator only; release at the reveal is what asks.
    private var deletePanel: some View {
        let progress = TokenSwipeRules.fillProgress(travel: deleteTravel)
        return panel(travel: deleteTravel, fill: restingFill.mix(with: .red, by: progress), edge: .trailing) {
            Image(systemName: "trash.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Grey → accent with a white checklist glyph. Indicator only; release at
    /// the reveal is what toggles.
    private var selectPanel: some View {
        let progress = TokenSwipeRules.fillProgress(travel: selectTravel)
        return panel(travel: selectTravel, fill: restingFill.mix(with: .accentColor, by: progress), edge: .leading) {
            Image(systemName: "checklist")
                .font(.body.weight(.bold))
                .foregroundStyle(.white)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Full row height, rounded only on its outer edge (`edge`) and square
    /// where it meets the card, extending under the card so no gap shows
    /// through the card's corner. The icon is always full size, centered in
    /// the VISIBLE travel and clipped to the panel, so it slides out from
    /// under the card edge rather than fading or growing in.
    private func panel(
        travel: CGFloat,
        fill: Color,
        edge: HorizontalEdge,
        @ViewBuilder icon: () -> some View
    ) -> some View {
        let outer: CGFloat = 16
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: edge == .leading ? outer : 0,
            bottomLeadingRadius: edge == .leading ? outer : 0,
            bottomTrailingRadius: edge == .trailing ? outer : 0,
            topTrailingRadius: edge == .trailing ? outer : 0
        )
        return shape
            .fill(fill)
            .frame(width: TokenSwipeRules.panelWidth(travel: travel))
            .overlay(alignment: edge == .leading ? .leading : .trailing) {
                icon()
                    .frame(width: max(0, travel))
            }
            .clipShape(shape)
    }

    /// Entering the mode never leaves a delete row armed.
    private func toggleSelection() {
        if openRowID != nil { openRowID = nil }
        onToggleSelection()
    }

    private var pan: TokenHorizontalPanGesture {
        TokenHorizontalPanGesture(
            onBegan: { x in
                // A clearly horizontal drag on this row closes any OTHER open row.
                if openRowID != nil, openRowID != id {
                    withAnimation(closeAnimation) { openRowID = nil }
                }
                translation = x * direction
            },
            onChanged: { x in
                translation = x * direction
            },
            onEnded: { x, _ in
                let outcome = TokenSwipeRules.outcome(
                    base: baseOffset,
                    translation: x * direction,
                    canDelete: canDelete,
                    canSelect: true
                )
                // Same motion as the transport: a row settling INTO its
                // revealed state lands with the disclose spring; anything
                // closing snaps shut with the decisive ease-out.
                withAnimation(outcome == .commitDelete ? openAnimation : closeAnimation) {
                    translation = 0
                    switch outcome {
                    case .commitDelete:
                        // Stay revealed while the alert is up; closes on dismiss.
                        openRowID = id
                        confirmingDelete = true
                    case .close:
                        openRowID = nil
                    case .toggleSelect:
                        toggleSelection()
                    }
                }
            },
            onCancelled: {
                withAnimation(closeAnimation) { translation = 0 }
            },
            onPressChanged: { pressed in
                // Off the touch callback: mutating view state synchronously
                // inside UIKit's touch delivery re-renders mid-gesture.
                Task { @MainActor in isPressed = pressed }
            }
        )
    }
}

#if DEBUG
#Preview("Swipe right to select, left to remove") {
  PreviewValue(false) { selected in
    PreviewValue(String?.none) { openRow in
      ScrollView {
        TokenSwipeCard(id: "bitcoin", openRowID: openRow, isSelected: selected.wrappedValue,
                       inSelectionMode: selected.wrappedValue, onToggleSelection: { selected.wrappedValue.toggle() },
                       deleteTitle: "Remove Bitcoin?", onDelete: {}) {
          AnalysisTokenHeader(coinId: "bitcoin", quote: PreviewFixtures.quotes[0])
        }.padding()
      }
    }
  }.preferredColorScheme(.dark)
}
#endif
