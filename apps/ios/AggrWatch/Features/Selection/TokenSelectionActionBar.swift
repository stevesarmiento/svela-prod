import SwiftUI

/// Analyze / Remove / Cancel share one glass pill, with clear button surfaces
/// so additional material layers don't obscure the pill's Liquid Glass.
struct TokenSelectionActionBar: View {
    var canRemove = true
    var isBusy = false
    let canAnalyze: Bool
    let onCancel: () -> Void
    let onRemove: () -> Void
    let onAnalyze: () -> Void

    @ScaledMetric(relativeTo: .footnote) private var segmentHeight: CGFloat = 72
    @ScaledMetric(relativeTo: .title2) private var iconSize: CGFloat = 24

    var body: some View {
        GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                segment("Analyze", icon: Image("ActionAnalyze"), tint: .accentColor, accessibilityLabel: "Analyze selected") {
                    onAnalyze()
                }
                    .disabled(!canAnalyze)
                    .opacity(canAnalyze ? 1 : 0.4)
                if canRemove {
                    segment("Remove", icon: Image(systemName: "trash"), tint: .red, accessibilityLabel: "Remove selected") {
                        onRemove()
                    }
                }
                segment("Cancel", icon: Image(systemName: "xmark"), tint: .secondary, accessibilityLabel: "Cancel selection") {
                    onCancel()
                }
            }
            .disabled(isBusy)
            .padding(6)
            .glassEffect(.regular, in: .rect(cornerRadius: 30))
        }
        // Aufn's content-sized pill: 312 × 84 pt for three segments at default text size.
        // Labels can wrap and height grows with Dynamic Type.
        .fontDesign(.rounded)
        .padding(.horizontal, 20)
    }

    private func segment(
        _ title: String,
        icon: Image,
        tint: Color? = nil,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                icon.renderingMode(.template).resizable().scaledToFit()
                    .font(.title2.weight(.semibold))
                    .frame(width: iconSize, height: iconSize)
                Text(title)
                    .font(.footnote.weight(.semibold))
            }
            .foregroundStyle(tint ?? .primary)
            .frame(maxWidth: 96, minHeight: segmentHeight)
            .multilineTextAlignment(.center)
            .contentShape(.rect(cornerRadius: 24))
        }
        .buttonStyle(SelectionActionButtonStyle(highlight: tint ?? .white))
        .accessibilityLabel(accessibilityLabel)
    }
}

/// Momentary feedback leaves the shared glass unobstructed when the button is idle.
private struct SelectionActionButtonStyle: ButtonStyle {
    let highlight: Color
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed && isEnabled
        configuration.label
            .scaleEffect(pressed && !reduceMotion ? 0.96 : 1)
            .background {
                RoundedRectangle(cornerRadius: 24)
                    .fill(highlight.opacity(pressed ? 0.16 : 0))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 24)
                    .strokeBorder(highlight.opacity(pressed ? 0.22 : 0), lineWidth: 1)
                    .allowsHitTesting(false)
            }
            .contentShape(.rect(cornerRadius: 24))
            .animation(reduceMotion ? nil : .easeOut(duration: pressed ? 0.08 : 0.18), value: pressed)
    }
}


#if DEBUG
#Preview("Selection actions") {
  TokenSelectionActionBar(canAnalyze: true, onCancel: {}, onRemove: {}, onAnalyze: {}).preferredColorScheme(.dark)
}
#Preview("Screener actions") {
  TokenSelectionActionBar(canRemove: false, canAnalyze: true, onCancel: {}, onRemove: {}, onAnalyze: {}).preferredColorScheme(.dark)
}
#Preview("Too many selected") {
  TokenSelectionActionBar(canAnalyze: false, onCancel: {}, onRemove: {}, onAnalyze: {}).preferredColorScheme(.dark)
}
#Preview("Web action icons") {
  VStack(alignment: .leading, spacing: 20) {
    ForEach(["ActionAnalyze", "ActionCreateWatchlist", "ActionAddToken", "ActionCollapseWatchlists", "ActionExpandWatchlists", "ActionWatchlists", "NavigationSearch"], id: \.self) { name in
      HStack(spacing: 16) {
        Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: 28, height: 28)
        Text(name).font(.caption)
      }
    }
  }.padding().preferredColorScheme(.dark)
}
#endif
