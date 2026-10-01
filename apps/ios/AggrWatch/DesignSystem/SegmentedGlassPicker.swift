import SwiftUI
import UIKit

/// The system segmented control supplies the interactive Liquid Glass selection lens.
struct SegmentedGlassPicker<Option: Hashable>: View {
  let options: [Option]
  let label: (Option) -> String
  @Binding var selection: Option
  var accessibilityLabel = "Options"
  var accessibilityIdentifier: String? = nil
  var segmentWidth: CGFloat = 62

  var body: some View {
    NativeSegmentedPicker(options: options, label: label, selection: $selection,
                          accessibilityLabel: accessibilityLabel, accessibilityIdentifier: accessibilityIdentifier)
      .frame(maxWidth: CGFloat(options.count) * segmentWidth)
      .frame(minHeight: Theme.hitTarget)
      .frame(maxWidth: .infinity, alignment: .center)
      .accessibilityIdentifier(accessibilityIdentifier ?? "")
  }
}

/// Keeps UIKit's native lens and labels with a transparent track.
private struct NativeSegmentedPicker<Option: Hashable>: UIViewRepresentable {
  let options: [Option]
  let label: (Option) -> String
  @Binding var selection: Option
  let accessibilityLabel: String
  let accessibilityIdentifier: String?

  func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

  func makeUIView(context: Context) -> UISegmentedControl {
    let control = TracklessSegmentedControl(items: options.map(label))
    control.backgroundColor = .clear
    control.accessibilityLabel = accessibilityLabel
    control.accessibilityIdentifier = accessibilityIdentifier
    control.addTarget(context.coordinator, action: #selector(Coordinator.selectionChanged(_:)), for: .valueChanged)
    return control
  }

  func updateUIView(_ control: UISegmentedControl, context: Context) {
    if context.coordinator.parent.options != options {
      control.removeAllSegments()
      for (index, option) in options.enumerated() {
        control.insertSegment(withTitle: label(option), at: index, animated: false)
      }
    }
    context.coordinator.parent = self
    let index = options.firstIndex(of: selection) ?? UISegmentedControl.noSegment
    if control.selectedSegmentIndex != index { control.selectedSegmentIndex = index }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UISegmentedControl, context: Context) -> CGSize? {
    CGSize(width: proposal.width ?? CGFloat(options.count) * 62, height: Theme.hitTarget)
  }

  @MainActor
  final class Coordinator: NSObject {
    var parent: NativeSegmentedPicker

    init(parent: NativeSegmentedPicker) { self.parent = parent }

    @objc func selectionChanged(_ control: UISegmentedControl) {
      guard parent.options.indices.contains(control.selectedSegmentIndex) else { return }
      let next = parent.options[control.selectedSegmentIndex]
      guard next != parent.selection else { return }
      parent.selection = next
      Haptics.selection()
    }
  }
}

/// Shared by text pickers; UIKit keeps ownership of touch tracking.
final class TracklessSegmentedControl: UISegmentedControl {
  override func layoutSubviews() {
    super.layoutSubviews()
    // UIKit has no track-only appearance property. Its immediate image views draw the
    // segment backgrounds; the native lens and labels live separately. Keep this scoped to
    // full-height background images and never touch backgroundImage APIs, which disable glass.
    for case let background as UIImageView in subviews
    where abs(background.frame.height - bounds.height) < 1 {
      background.isHidden = true
    }
  }
}
