import AggrCore
import SwiftUI

/// Centered chart time ranges with a background only on the active selection.
struct TimeScalePicker: View {
  let scales: [TimeScale]
  @Binding var selection: TimeScale

  var body: some View {
    HStack(spacing: 6) {
      ForEach(scales) { scale in
        Button {
          withAnimation(.snappy(duration: 0.25)) { selection = scale }
        } label: {
          Text(scale.label)
            .font(.system(.body, design: .rounded, weight: .semibold))
            .monospacedDigit()
            .lineLimit(1).minimumScaleFactor(0.7)
            .padding(.horizontal, 12)
            .frame(minWidth: 48, minHeight: 44)
            .foregroundStyle(selection == scale ? .primary : .secondary)
            .background(selection == scale ? Color.white.opacity(0.12) : .clear, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selection == scale ? .isSelected : [])
      }
    }
    .frame(maxWidth: .infinity, alignment: .center)
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
