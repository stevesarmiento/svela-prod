import AggrCore
import SwiftUI

/// Glass segmented selector for time scales (1D / 1W / 1M / 1Y / 2Y).
struct TimeScalePicker: View {
  let scales: [TimeScale]
  @Binding var selection: TimeScale

  var body: some View {
    GlassEffectContainer(spacing: 4) {
      HStack(spacing: 2) {
        ForEach(scales) { scale in
          Button {
            withAnimation(.snappy(duration: 0.25)) { selection = scale }
          } label: {
            Text(scale.label)
              .font(.caption.weight(.semibold))
              .monospacedDigit()
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .foregroundStyle(selection == scale ? .primary : .secondary)
              .background(selection == scale ? Color.white.opacity(0.12) : .clear, in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(selection == scale ? .isSelected : [])
        }
      }
      .padding(3)
      .glassEffect(.regular, in: Capsule())
    }
  }
}

#if DEBUG
#Preview("Interactive time ranges") {
  VStack(spacing: 24) {
    PreviewValue(TimeScale.d1) { TimeScalePicker(scales: TimeScale.overviewScales, selection: $0) }
    PreviewValue(TimeScale.d30) { TimeScalePicker(scales: TimeScale.tokenScales, selection: $0) }
  }.padding().preferredColorScheme(.dark)
}
#endif
