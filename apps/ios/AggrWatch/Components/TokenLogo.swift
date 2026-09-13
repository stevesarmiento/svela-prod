import AggrCore
import SwiftUI
import UIKit

/// Token logo with curated overrides (`LogoOverrides`) and a letter-avatar fallback.
struct TokenLogo: View {
  let symbol: String
  let imageURL: String?
  var size: CGFloat = 28

  static func bundledImage(symbol: String) -> UIImage? {
    guard let name = LogoOverrides.bundledAssetName(symbol: symbol) else { return nil }
    return UIImage(named: "TokenLogo-" + name.replacingOccurrences(of: "/", with: "-"))
  }

  private var apiURL: URL? {
    #if DEBUG
    if PreviewData.isRunning { return nil }
    #endif
    guard let imageURL, let url = URL(string: imageURL),
          ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { return nil }
    return url
  }

  private var resolvedURL: URL? {
    #if DEBUG
    if PreviewData.isRunning { return nil }
    #endif
    let url = LogoOverrides.tokenLogoURL(symbol: symbol, fallback: imageURL)
    // SVG overrides belong in the compiled asset catalog, not the remote raster decoder.
    return url?.pathExtension.lowercased() == "svg" ? apiURL : url
  }

  var body: some View {
    Group {
      if let image = Self.bundledImage(symbol: symbol) {
        Image(uiImage: image).resizable().scaledToFill()
      } else if let url = resolvedURL {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          case .failure:
            if let apiURL, apiURL != url {
              AsyncImage(url: apiURL) { phase in
                if let image = phase.image { image.resizable().scaledToFill() }
                else { fallback }
              }
            } else { fallback }
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

/// Edge-to-edge artwork with the same circular glass finish as the toolbar triggers.
/// The enclosing row continues to own taps, selection, and swipe actions.
struct GlassTokenLogo: View {
  let symbol: String
  let imageURL: String?
  var size: CGFloat = 34

  var body: some View {
    TokenLogo(symbol: symbol, imageURL: imageURL, size: size)
      .glassEffect(.regular, in: .circle)
  }
}

/// Overlapping avatar stack with "+N" overflow, mirrors `AvatarCircles`.
struct TokenAvatarStack: View {
  struct Item: Hashable { var symbol: String; var imageURL: String? }
  let items: [Item]
  var maxVisible = 4
  var size: CGFloat = 26
  var usesGlass = false

  var body: some View {
    let visible = Array(items.prefix(maxVisible))
    let extra = max(0, items.count - maxVisible)
    HStack(spacing: -size * 0.3) {
      ForEach(Array(visible.enumerated()), id: \.offset) { _, item in
        if usesGlass {
          GlassTokenLogo(symbol: item.symbol, imageURL: item.imageURL, size: size)
        } else {
          TokenLogo(symbol: item.symbol, imageURL: item.imageURL, size: size)
            .overlay(Circle().strokeBorder(.black.opacity(0.35), lineWidth: 1.5))
        }
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

#if DEBUG
#Preview("Glass token logos") {
  HStack(spacing: 20) {
    ForEach(["BTC", "ETH", "SOL"], id: \.self) { symbol in
      GlassTokenLogo(symbol: symbol, imageURL: nil, size: 44)
    }
  }.padding().preferredColorScheme(.dark)
}
#Preview("Token avatars and overflow") {
  VStack(spacing: 20) {
    HStack { TokenLogo(symbol: "BTC", imageURL: nil, size: 48); TokenLogo(symbol: "ETH", imageURL: nil); TokenLogo(symbol: "?", imageURL: nil) }
    TokenAvatarStack(items: ["BTC", "ETH", "SOL", "AVAX", "LINK", "ARB"].map { .init(symbol: $0, imageURL: nil) })
  }.padding().preferredColorScheme(.dark)
}
#Preview("Glass card token avatars") {
  TokenAvatarStack(items: ["BTC", "ETH", "SOL"].map { .init(symbol: $0, imageURL: nil) }, maxVisible: 3, size: 18, usesGlass: true)
    .padding()
    .background(.blue.opacity(0.3), in: .rect(cornerRadius: 20))
    .padding()
    .preferredColorScheme(.dark)
}
#endif
