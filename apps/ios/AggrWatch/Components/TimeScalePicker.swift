import AggrCore
import SwiftUI

/// Chart time-range picker on the shared segmented glass control.
struct TimeScalePicker: View {
  let scales: [TimeScale]
  @Binding var selection: TimeScale

  var body: some View {
    SegmentedGlassPicker(options: scales, label: \.label, selection: $selection,
                         accessibilityLabel: "Chart time range", accessibilityIdentifier: "chart-time-range")
  }
}

#if DEBUG
#Preview("Interactive time ranges") {
  VStack(spacing: 24) {
    PreviewValue(TimeScale.d1) { TimeScalePicker(scales: TimeScale.overviewScales, selection: $0) }
    PreviewValue(TimeScale.d30) { TimeScalePicker(scales: TimeScale.tokenScales, selection: $0) }
    PreviewValue(TimeScale.d1) { TimeScalePicker(scales: TimeScale.compareScales, selection: $0) }
  }.padding().preferredColorScheme(.dark)
}
#endif
