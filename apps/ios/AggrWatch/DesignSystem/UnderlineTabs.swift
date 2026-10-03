import SwiftUI

/// Text tabs over an underline track. Every option gets an equal segment with its label centered;
/// the track runs the full width as a hairline, and the active segment's run is bright and
/// thicker, sliding between segments on selection. Content switches (Report / Market data,
/// Tokens / Collectibles) use this; value pickers (time scales) keep the glass pills.
struct UnderlineTabs<Option: Hashable>: View {
  let options: [Option]
  let label: (Option) -> String
  @Binding var selection: Option
  var accessibilityLabel = "Options"
  var accessibilityIdentifier: String? = nil
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private static var activeHeight: CGFloat { 3 }
  private static var trackHeight: CGFloat { 1.5 }

  var body: some View {
    let index = options.firstIndex(of: selection) ?? 0
    VStack(spacing: 10) {
      HStack(spacing: 0) {
        ForEach(options, id: \.self) { option in
          let active = option == selection
          Button {
            withAnimation(Motion.animation(Motion.ui, reduceMotion: reduceMotion)) { selection = option }
          } label: {
            Text(label(option))
              .font(.system(.body, design: .rounded, weight: .semibold))
              .foregroundStyle(active ? Color.white : Color.white.opacity(0.35))
              .lineLimit(1)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 6)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
        }
      }
      GeometryReader { geometry in
        let segment = geometry.size.width / CGFloat(max(1, options.count))
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.14))
            .frame(height: Self.trackHeight)
            .frame(maxHeight: .infinity)
          Capsule().fill(Color.white)
            .frame(width: segment, height: Self.activeHeight)
            .offset(x: segment * CGFloat(index))
        }
      }
      .frame(height: Self.activeHeight)
      .accessibilityHidden(true)
    }
    .animation(Motion.animation(Motion.ui, reduceMotion: reduceMotion), value: selection)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(accessibilityLabel)
    .accessibilityIdentifier(accessibilityIdentifier ?? "")
  }
}

#if DEBUG
#Preview("Underline tabs") {
  PreviewValue(false) { showMetrics in
    VStack(spacing: 32) {
      UnderlineTabs(options: [false, true], label: { $0 ? "Collectibles" : "Tokens" }, selection: showMetrics)
      UnderlineTabs(options: [0, 1, 2], label: { ["Report", "Market data", "Flow"][$0] }, selection: .constant(1))
    }
    .padding(.horizontal, 16)
    .preferredColorScheme(.dark)
  }
}
#endif
