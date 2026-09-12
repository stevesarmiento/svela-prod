import AggrCore
import SwiftUI

/// Token logo with curated overrides (`LogoOverrides`) and a letter-avatar fallback.
struct TokenLogo: View {
  let symbol: String
  let imageURL: String?
  var size: CGFloat = 28

  private var resolvedURL: URL? {
    LogoOverrides.tokenLogoURL(symbol: symbol, fallback: imageURL)
  }

  var body: some View {
    Group {
      if let url = resolvedURL {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          case .failure:
            fallback
          default:
            Circle().fill(.quaternary)
          }
        }
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
  }

  private var fallback: some View {
    ZStack {
      Circle().fill(.quaternary)
      Text(symbol.prefix(1).uppercased())
        .font(.system(size: size * 0.45, weight: .semibold, design: .rounded))
        .foregroundStyle(.secondary)
    }
  }
}

/// Overlapping avatar stack with "+N" overflow, mirrors `AvatarCircles`.
struct TokenAvatarStack: View {
  struct Item: Hashable { var symbol: String; var imageURL: String? }
  let items: [Item]
  var maxVisible = 4
  var size: CGFloat = 26

  var body: some View {
    let visible = Array(items.prefix(maxVisible))
    let extra = max(0, items.count - maxVisible)
    HStack(spacing: -size * 0.3) {
      ForEach(Array(visible.enumerated()), id: \.offset) { _, item in
        TokenLogo(symbol: item.symbol, imageURL: item.imageURL, size: size)
          .overlay(Circle().strokeBorder(.black.opacity(0.35), lineWidth: 1.5))
      }
      if extra > 0 {
        Text("+\(extra)")
          .font(.system(size: size * 0.4, weight: .semibold))
          .frame(width: size, height: size)
          .background(.black.opacity(0.35), in: Circle())
          .overlay(Circle().strokeBorder(.white.opacity(0.2), lineWidth: 1))
      }
    }
  }
}
