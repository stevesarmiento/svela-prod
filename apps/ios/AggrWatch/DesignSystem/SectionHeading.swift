import SwiftUI

/// Icon + title row that opens a content section.
struct SectionHeading: View {
  let title: String
  let systemImage: String

  var body: some View {
    Label(title, systemImage: systemImage)
      .font(.headline)
      .labelStyle(SectionHeadingLabelStyle())
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityAddTraits(.isHeader)
  }
}

private struct SectionHeadingLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 10) {
      configuration.icon
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(width: 20)
      configuration.title
    }
  }
}

/// Small-caps title centred between two hairlines ("STATS").
struct RuledSectionHeading: View {
  let title: String

  var body: some View {
    HStack(spacing: Theme.Spacing.sm) {
      rule
      Text(title.uppercased())
        .font(.caption.weight(.semibold))
        .tracking(1.2)
        .foregroundStyle(.secondary)
        .fixedSize()
      rule
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(title)
    .accessibilityAddTraits(.isHeader)
  }

  private var rule: some View {
    Rectangle().fill(Theme.border).frame(height: 1).frame(maxWidth: .infinity)
  }
}

/// 1pt divider in the theme's border colour.
struct Hairline: View {
  var axis: Axis = .horizontal

  var body: some View {
    Rectangle()
      .fill(Theme.border)
      .frame(width: axis == .vertical ? 1 : nil, height: axis == .horizontal ? 1 : nil)
      .accessibilityHidden(true)
  }
}
