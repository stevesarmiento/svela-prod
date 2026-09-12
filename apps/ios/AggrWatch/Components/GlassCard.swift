import SwiftUI

/// Card surface using iOS 26 Liquid Glass (replaces the shadow-heavy web `Card`).
struct GlassCard<Content: View>: View {
  var cornerRadius: CGFloat = 20
  var tint: Color? = nil
  @ViewBuilder var content: () -> Content

  var body: some View {
    content()
      .glassEffect(tint.map { .regular.tint($0) } ?? .regular, in: .rect(cornerRadius: cornerRadius))
  }
}

/// Section card with a title row, mirrors the web dashboard cards.
struct SectionCard<Content: View>: View {
  let title: String
  var subtitle: String? = nil
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.headline)
        if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
      }
      content()
    }
    .padding(16)
    .background(.background.secondary, in: .rect(cornerRadius: 20))
  }
}
