import SwiftUI

/// Adapts Aufn’s glass action pill to Cancel / Remove / Analyze, the way a wallet's edit mode
/// swaps its tab bar for actions. Shaped glass per segment (plain button +
/// explicit glassEffect — `.buttonStyle(.glass)` blobs non-square labels) so
/// the segments read as one control inside the container.
struct TokenSelectionActionBar: View {
    var canRemove = true
    var isBusy = false
    let canAnalyze: Bool
    let onCancel: () -> Void
    let onRemove: () -> Void
    let onAnalyze: () -> Void

    @ScaledMetric(relativeTo: .footnote) private var segmentHeight: CGFloat = 72

    var body: some View {
        GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                segment("Cancel", systemImage: "xmark", accessibilityLabel: "Cancel selection") {
                    onCancel()
                }
                if canRemove {
                    segment("Remove", systemImage: "trash.fill", tint: .red, accessibilityLabel: "Remove selected") {
                        onRemove()
                    }
                }
                segment("Analyze", systemImage: "sparkles", accessibilityLabel: "Analyze selected") {
                    onAnalyze()
                }
                    .disabled(!canAnalyze)
                    .opacity(canAnalyze ? 1 : 0.4)
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
        systemImage: String,
        tint: Color? = nil,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title2.weight(.semibold))
                Text(title)
                    .font(.footnote.weight(.semibold))
            }
            .foregroundStyle(tint ?? .primary)
            .frame(maxWidth: 96, minHeight: segmentHeight)
            .multilineTextAlignment(.center)
            .contentShape(.rect(cornerRadius: 24))
        }
        .buttonStyle(.plain)
        .glassEffect(
            tint.map { .regular.tint($0.opacity(0.22)).interactive() } ?? .regular.interactive(),
            in: .rect(cornerRadius: 24)
        )
        .accessibilityLabel(accessibilityLabel)
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
#endif
