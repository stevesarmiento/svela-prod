import AggrCore
import SwiftUI
import UIKit

/// Token logo with curated overrides (`LogoOverrides`), the shared image cache, and a letter-avatar
/// fallback. Cached artwork paints on the first frame, so a revisited row never flashes the letter.
struct TokenLogo: View {
  let symbol: String
  let imageURL: String?
  var size: CGFloat = 28
  @State private var loaded: (url: URL, image: UIImage)?

  static func bundledImage(symbol: String) -> UIImage? {
    guard let name = LogoOverrides.bundledAssetName(symbol: symbol) else { return nil }
    return UIImage(named: "TokenLogo-" + name.replacingOccurrences(of: "/", with: "-"))
  }

  /// Remote candidates in the order they are tried: the curated override (unless it is an SVG,
  /// which the raster decoder cannot read), then the API artwork. Empty in previews.
  static func logoCandidates(symbol: String, imageURL: String?) -> [URL] {
    #if DEBUG
    if PreviewData.isRunning { return [] }
    #endif
    let api = imageURL.flatMap(URL.init(string:)).flatMap {
      ["https", "http"].contains($0.scheme?.lowercased() ?? "") ? $0 : nil
    }
    let override = LogoOverrides.tokenLogoURL(symbol: symbol, fallback: imageURL)
    let primary = override?.pathExtension.lowercased() == "svg" ? api : override
    var candidates: [URL] = []
    for url in [primary, api] {
      if let url, ["https", "http"].contains(url.scheme?.lowercased() ?? ""), !candidates.contains(url) { candidates.append(url) }
    }
    return candidates
  }

  private var candidates: [URL] { Self.logoCandidates(symbol: symbol, imageURL: imageURL) }

  var body: some View {
    Group {
      if let image = Self.bundledImage(symbol: symbol) {
        Image(uiImage: image).resizable().scaledToFill()
      } else if let image = displayedImage {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        TokenLogoFallback(symbol: symbol, size: size)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .task(id: "\(symbol)|\(imageURL ?? "")") {
      let candidates = candidates
      guard !candidates.isEmpty, loaded.map({ !candidates.contains($0.url) }) ?? true else { return }
      for url in candidates {
        if let cached = AggrImageCache.shared.cachedImage(for: url) {
          loaded = (url, cached)
          return
        }
      }
      for url in candidates {
        let image = await AggrImageCache.shared.image(for: url)
        guard !Task.isCancelled else { return }
        // A URL that fails to load must not blank artwork that is already showing.
        if let image { loaded = (url, image); return }
      }
    }
  }

  /// Peeks the memory cache during the first render, so cached artwork never flashes the letter
  /// fallback for a frame while `.task` catches up (rows scrolling in, pages being pushed).
  private var displayedImage: UIImage? {
    let candidates = candidates
    if let loaded, candidates.contains(loaded.url) { return loaded.image }
    for url in candidates {
      if let cached = AggrImageCache.shared.cachedImage(for: url) { return cached }
    }
    return loaded?.image
  }
}

/// Letter avatar used when artwork is missing.
struct TokenLogoFallback: View {
  let symbol: String
  var size: CGFloat = 28

  var body: some View {
    ZStack {
      Circle().fill(.quaternary)
      Text(symbol.prefix(1).uppercased())
        .font(.system(size: size * 0.45, weight: .semibold, design: .rounded))
        .foregroundStyle(.secondary)
    }
    .frame(width: size, height: size)
  }
}

/// Token artwork from an already-resolved image. `TokenLogo` loads in a `.task`, which never runs
/// inside `ImageRenderer`, so offscreen renders pass the image in directly.
struct StaticTokenLogo: View {
  let symbol: String
  let image: UIImage?
  var size: CGFloat = 28

  var body: some View {
    Group {
      if let image {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        TokenLogoFallback(symbol: symbol, size: size)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
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
    .background(.blue.opacity(0.3), in: .rect(cornerRadius: Theme.Radius.card))
    .padding()
    .preferredColorScheme(.dark)
}
#endif
