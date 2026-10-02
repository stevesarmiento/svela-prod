import AggrCore
import SwiftUI
import UIKit

/// Token logo with curated overrides (`LogoOverrides`), the shared image cache, and a letter-avatar
/// fallback. Cached artwork paints on the first frame, so a revisited row never flashes the letter.
struct TokenLogo: View {
  let symbol: String
  let imageURL: String?
  var size: CGFloat = 28
  /// What `.task` settled on for an identity (possibly no artwork), so later bodies do no lookups.
  @State private var resolved: Resolved?

  private struct Identity: Hashable {
    let symbol: String
    let imageURL: String?
  }

  private struct Resolved {
    let identity: Identity
    let image: UIImage?
  }

  /// `UIImage(named:)` walks the asset catalog each call; one lookup per symbol is plenty.
  private static var bundledImages: [String: UIImage?] = [:]

  static func bundledImage(symbol: String) -> UIImage? {
    if let known = bundledImages[symbol] { return known }
    let image = LogoOverrides.bundledAssetName(symbol: symbol)
      .flatMap { UIImage(named: "TokenLogo-" + $0.replacingOccurrences(of: "/", with: "-")) }
    if bundledImages.count >= 512 { bundledImages.removeAll(keepingCapacity: true) }
    bundledImages[symbol] = .some(image)
    return image
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

  var body: some View {
    let identity = Identity(symbol: symbol, imageURL: imageURL)
    let bundled = Self.bundledImage(symbol: symbol)
    Group {
      if let image = bundled {
        Image(uiImage: image).resizable().scaledToFill()
      } else if let image = displayedImage(for: identity) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        TokenLogoFallback(symbol: symbol, size: size)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .task(id: identity) {
      // Bundled art needs no download; a settled identity with art needs no second look. One
      // that settled without art is retried on each appearance, gated by the cache's backoff.
      guard bundled == nil else { return }
      if let resolved, resolved.identity == identity, resolved.image != nil { return }
      let candidates = Self.logoCandidates(symbol: symbol, imageURL: imageURL)
      for url in candidates {
        if let cached = AggrImageCache.shared.cachedImage(for: url) {
          settle(cached, for: identity)
          return
        }
      }
      for url in candidates {
        let image = await AggrImageCache.shared.image(for: url)
        guard !Task.isCancelled else { return }
        if let image {
          settle(image, for: identity)
          return
        }
      }
      // A URL that fails to load must not blank artwork that is already showing.
      settle(resolved?.image, for: identity)
    }
  }

  private func settle(_ image: UIImage?, for identity: Identity) {
    guard resolved?.identity != identity || resolved?.image !== image else { return }
    resolved = Resolved(identity: identity, image: image)
  }

  /// Until `.task` has settled this identity, peeks the memory cache so artwork decoded earlier
  /// never flashes the letter fallback for a frame (rows scrolling in, pages being pushed).
  /// Memory only: the disk thumbnail is read by the task, off the main thread.
  private func displayedImage(for identity: Identity) -> UIImage? {
    if let resolved, resolved.identity == identity { return resolved.image }
    for url in Self.logoCandidates(symbol: symbol, imageURL: imageURL) {
      if let cached = AggrImageCache.shared.cachedImage(for: url) { return cached }
    }
    return resolved?.image
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
