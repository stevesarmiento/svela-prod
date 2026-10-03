import SwiftUI

/// Body text that collapses to a few lines behind a fade and a "Read More" control. Truncation is
/// measured, not guessed, so short text never shows the control.
///
/// The measurement is taken once per (text, width): an unlimited twin is laid out only until the
/// comparison is known, then removed, so a feed of cards does not lay out two copies of every
/// summary on each body.
struct ExpandableText: View {
  let text: String
  var collapsedLines = 3
  var moreTitle = "Read More"
  var lessTitle = "Show Less"
  var accessibilityIdentifier = "expandable-text-toggle"
  @State private var expanded = false
  @State private var width: CGFloat = 0
  @State private var collapsedHeight: CGFloat = 0
  @State private var full: Probe?
  @State private var measurement: Measurement?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private struct Key: Equatable { var text: String; var width: CGFloat }
  private struct Probe { var key: Key; var height: CGFloat }
  private struct Measurement { var key: Key; var truncates: Bool }

  private var key: Key { Key(text: text, width: width) }
  private var truncates: Bool { measurement?.truncates ?? false }
  /// The twin is only needed while the current text and width have not been measured collapsed.
  private var needsMeasurement: Bool { !expanded && measurement?.key != key }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      body(lineLimit: expanded ? nil : collapsedLines)
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
          width = size.width
          if !expanded { collapsedHeight = size.height }
          resolve()
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
          if needsMeasurement {
            body(lineLimit: nil)
              .fixedSize(horizontal: false, vertical: true)
              .hidden()
              .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
                // Key by the twin's own width: it is proposed the same width as the visible copy,
                // so the keys agree regardless of which geometry callback fires first.
                full = Probe(key: Key(text: text, width: size.width), height: size.height)
                resolve()
              }
          }
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

  /// Records the comparison once both heights belong to the current text and width.
  private func resolve() {
    guard !expanded, width > 0, collapsedHeight > 0, let full, full.key == key else { return }
    let next = Measurement(key: key, truncates: full.height > collapsedHeight + 1)
    if measurement?.key != next.key || measurement?.truncates != next.truncates { measurement = next }
  }

  private func body(lineLimit: Int?) -> some View {
    Text(text)
      .font(.body)
      .lineSpacing(3)
      .foregroundStyle(Theme.secondaryText)
      .lineLimit(lineLimit)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
