import AggrCore
import SwiftUI
import UIKit

/// The system segmented picker supplies the interactive Liquid Glass selection lens.
struct TimeScalePicker: View {
  let scales: [TimeScale]
  @Binding var selection: TimeScale

  var body: some View {
    NativeTimeScalePicker(scales: scales, selection: $selection)
      .frame(maxWidth: CGFloat(scales.count) * 62)
      .frame(minHeight: 44)
      .frame(maxWidth: .infinity, alignment: .center)
      .accessibilityIdentifier("chart-time-range")
  }
}

/// Keep UIKit's native lens and labels with a transparent track.
private struct NativeTimeScalePicker: UIViewRepresentable {
  let scales: [TimeScale]
  @Binding var selection: TimeScale

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

  func makeUIView(context: Context) -> UISegmentedControl {
    let control = TracklessSegmentedControl(items: scales.map(\.label))
    control.backgroundColor = .clear
    control.accessibilityLabel = "Chart time range"
    control.accessibilityIdentifier = "chart-time-range"
    control.addTarget(context.coordinator, action: #selector(Coordinator.selectionChanged(_:)), for: .valueChanged)
    return control
  }

  func updateUIView(_ control: UISegmentedControl, context: Context) {
    if context.coordinator.parent.scales != scales {
      control.removeAllSegments()
      for (index, scale) in scales.enumerated() {
        control.insertSegment(withTitle: scale.label, at: index, animated: false)
      }
    }
    context.coordinator.parent = self
    let index = scales.firstIndex(of: selection) ?? UISegmentedControl.noSegment
    if control.selectedSegmentIndex != index { control.selectedSegmentIndex = index }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UISegmentedControl, context: Context) -> CGSize? {
    CGSize(width: proposal.width ?? CGFloat(scales.count) * 62, height: 44)
  }

  final class Coordinator: NSObject {
    var parent: NativeTimeScalePicker

    init(parent: NativeTimeScalePicker) { self.parent = parent }

    @objc func selectionChanged(_ control: UISegmentedControl) {
      guard parent.scales.indices.contains(control.selectedSegmentIndex) else { return }
      parent.selection = parent.scales[control.selectedSegmentIndex]
    }
  }
}

private final class TracklessSegmentedControl: UISegmentedControl {
  override func layoutSubviews() {
    super.layoutSubviews()
    // UIKit has no track-only appearance property. Its immediate image views
    // draw the segment backgrounds; the native lens and labels live separately.
    // Keep this scoped to full-height background images, without touching either
    // the lens hierarchy or backgroundImage APIs (which disable Liquid Glass).
    for case let background as UIImageView in subviews
      where abs(background.frame.height - bounds.height) < 1 {
      background.isHidden = true
    }
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
