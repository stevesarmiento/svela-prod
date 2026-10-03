import SwiftUI

/// Card surface on iOS 26 Liquid Glass.
/// Conventions: primary CTA `.buttonStyle(.glassProminent)`, secondary `.buttonStyle(.glass)`,
/// adjacent glass shapes inside one `GlassEffectContainer`.
struct GlassCard<Content: View>: View {
  var cornerRadius: CGFloat = Theme.Radius.card
  var tint: Color? = nil
  @ViewBuilder var content: () -> Content

  var body: some View {
    content()
      .glassEffect(tint.map { .regular.tint($0) } ?? .regular, in: .rect(cornerRadius: cornerRadius))
  }
}

/// Opaque section card with a title row, for content that should not refract what is behind it.
struct SectionCard<Content: View>: View {
  let title: String
  var subtitle: String? = nil
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.headline)
        if let subtitle { Text(subtitle).font(.footnote).foregroundStyle(.secondary) }
      }
      content()
    }
    .padding(Theme.Spacing.base)
    .background(Theme.surface, in: .rect(cornerRadius: Theme.Radius.card))
  }
}

#if DEBUG
#Preview("Glass cards") {
  VStack(spacing: 20) {
    GlassCard { Text("A reusable glass surface").padding() }
    SectionCard(title: "Market overview", subtitle: "Sample content") { PercentBadge(pct: 3.2) }
  }.padding().preferredColorScheme(.dark)
}
#endif
