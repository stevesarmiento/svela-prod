import SwiftUI

/// Body text that collapses to a few lines behind a fade and a "Read More" control. Truncation is
/// measured, not guessed, so short text never shows the control.
struct ExpandableText: View {
  let text: String
  var collapsedLines = 3
  var moreTitle = "Read More"
  var lessTitle = "Show Less"
  var accessibilityIdentifier = "expandable-text-toggle"
  @State private var expanded = false
  @State private var collapsedHeight: CGFloat = 0
  @State private var fullHeight: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var truncates: Bool { fullHeight > collapsedHeight + 1 }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      body(lineLimit: expanded ? nil : collapsedLines)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
          if !expanded { collapsedHeight = height }
        }
        .mask {
          if expanded || !truncates {
            Color.black
          } else {
            LinearGradient(
              stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.45), .init(color: .clear, location: 1)],
              startPoint: .top, endPoint: .bottom
            )
          }
        }
        .background {
          // Unlimited twin, laid out but invisible, tells us whether the visible copy truncates.
          body(lineLimit: nil)
            .fixedSize(horizontal: false, vertical: true)
            .hidden()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fullHeight = $0 }
        }

      if truncates {
        Button {
          withAnimation(Motion.animation(Motion.ui, reduceMotion: reduceMotion)) { expanded.toggle() }
        } label: {
          HStack(spacing: 6) {
            Text(expanded ? lessTitle : moreTitle)
            Image(systemName: "chevron.down")
              .font(.caption.weight(.semibold))
              .rotationEffect(.degrees(expanded ? 180 : 0))
          }
          .font(.body.weight(.medium))
          .foregroundStyle(Theme.text)
          .frame(minHeight: Theme.hitTarget)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(expanded ? lessTitle : moreTitle)
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
        .accessibilityIdentifier(accessibilityIdentifier)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func body(lineLimit: Int?) -> some View {
    Text(text)
      .font(.body)
      .lineSpacing(5)
      .foregroundStyle(Theme.secondaryText)
      .lineLimit(lineLimit)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
