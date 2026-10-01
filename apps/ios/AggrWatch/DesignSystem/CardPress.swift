import SwiftUI

extension EnvironmentValues {
  /// Press scale published by `CardPressStyle`; cards read it to resize their glass.
  @Entry var cardPressScale: CGFloat = 1
  /// Whether decorative loading effects should run (false when the grid is hidden).
  @Entry var cardLoadingVisible = true
}

/// Publishes press state through the environment so the card can give glass real, smaller bounds.
struct CardPressStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .compositingGroup()
      .environment(\.cardPressScale, configuration.isPressed && !reduceMotion ? 0.975 : 1)
      .opacity(configuration.isPressed && reduceMotion ? 0.9 : 1)
      .animation(reduceMotion ? nil : .easeOut(duration: configuration.isPressed ? 0.06 : 0.12), value: configuration.isPressed)
  }
}

/// Changes the size offered to glass without stretching or reflowing its label.
struct CardScaleLayout: Layout {
  var scale: CGFloat

  var animatableData: CGFloat {
    get { scale }
    set { scale = newValue }
  }

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let size = content.sizeThatFits(ProposedViewSize(width: proposal.width.map { $0 / scale },
                                                     height: proposal.height.map { $0 / scale }))
    return CGSize(width: size.width * scale, height: size.height * scale)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center,
                          proposal: ProposedViewSize(width: bounds.width / scale, height: bounds.height / scale))
  }
}
