import SwiftUI

struct StatTile: View {
  let value: String
  let label: String
  var tint: Color = .primary

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value)
        .font(.number(.subheadline, weight: .semibold))
        .foregroundStyle(tint)
        .lineLimit(1)
      Text(label.uppercased())
        .font(.system(size: 10))
        .tracking(0.6)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Small caption label with an info popover.
struct MetricLabel: View {
  let label: String
  let help: String
  @State private var showHelp = false

  var body: some View {
    HStack(spacing: 4) {
      Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(.secondary)
      Button {
        showHelp = true
      } label: {
        Image(systemName: "info.circle").font(.system(size: 10)).foregroundStyle(.tertiary)
      }
      .buttonStyle(.plain)
      .popover(isPresented: $showHelp) {
        Text(help).font(.footnote).padding(12).frame(maxWidth: 260).presentationCompactAdaptation(.popover)
      }
      .accessibilityLabel("\(label) info")
    }
  }
}

/// Placeholder block for loading states.
struct SkeletonBlock: View {
  var height: CGFloat = 14
  var width: CGFloat? = nil

  var body: some View {
    RoundedRectangle(cornerRadius: 4)
      .fill(.quaternary)
      .frame(width: width, height: height)
      .redacted(reason: .placeholder)
      .accessibilityHidden(true)
  }
}
