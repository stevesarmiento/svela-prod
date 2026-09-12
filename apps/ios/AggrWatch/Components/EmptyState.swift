import SwiftUI

struct EmptyState: View {
  let systemImage: String
  let title: String
  let message: String
  var actionTitle: String? = nil
  var action: (() -> Void)? = nil

  var body: some View {
    VStack(spacing: 14) {
      Image(systemName: systemImage)
        .font(.system(size: 36, weight: .light))
        .foregroundStyle(.secondary)
      Text(title).font(.headline)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .buttonStyle(.glassProminent)
          .padding(.top, 4)
      }
    }
    .padding(28)
    .frame(maxWidth: .infinity)
  }
}

struct SkeletonBlock: View {
  var height: CGFloat = 14
  var width: CGFloat? = nil
  var body: some View {
    RoundedRectangle(cornerRadius: 6)
      .fill(.quaternary)
      .frame(width: width, height: height)
      .redacted(reason: .placeholder)
  }
}
