import AggrCore
import AggrLiveline
import UIKit

/// Picks a dominant hue instead of averaging multicolor logos into a muddy line.
enum TokenIconColor {
  static func color(from image: UIImage?) -> LivelineColor? {
    guard let image = image?.cgImage else { return nil }
    let side = 32
    var pixels = [UInt8](repeating: 0, count: side * side * 4)
    let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard let context = CGContext(
        data: bytes.baseAddress, width: side, height: side,
        bitsPerComponent: 8, bytesPerRow: side * 4,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
      ) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
      return true
    }
    guard drawn else { return nil }

    struct Bucket {
      var weight = 0.0
      var red = 0.0
      var green = 0.0
      var blue = 0.0
    }
    var buckets = [Bucket](repeating: Bucket(), count: 24)
    for offset in stride(from: 0, to: pixels.count, by: 4) {
      let alpha = Double(pixels[offset + 3]) / 255
      guard alpha >= 0.5 else { continue }
      let red = Double(pixels[offset]) / (255 * alpha)
      let green = Double(pixels[offset + 1]) / (255 * alpha)
      let blue = Double(pixels[offset + 2]) / (255 * alpha)
      var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0
      UIColor(red: red, green: green, blue: blue, alpha: 1)
        .getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: nil)
      // Ignore the white/black surrounds common in token artwork.
      guard saturation >= 0.2, brightness >= 0.15 else { continue }
      let index = min(buckets.count - 1, Int(hue * Double(buckets.count)))
      let weight = Double(saturation) * alpha
      buckets[index].weight += weight
      buckets[index].red += red * weight
      buckets[index].green += green * weight
      buckets[index].blue += blue * weight
    }
    guard let dominant = buckets.max(by: { $0.weight < $1.weight }), dominant.weight >= 2 else { return nil }
    var red = dominant.red / dominant.weight
    var green = dominant.green / dominant.weight
    var blue = dominant.blue / dominant.weight
    // Keep dark brand colors legible on the chart's dark surface without changing their hue.
    let lift = max(1, 0.75 / max(red, green, blue))
    red *= lift
    green *= lift
    blue *= lift
    return LivelineColor(min(1, red), min(1, green), min(1, blue))
  }
}

/// Chart line colors derived from token logos, cached per logo identity so re-created
/// cards (every parent body pass) and revisits do not re-sample the image.
enum TokenLineColor {
  private static var cache: [String: LivelineColor] = [:]

  /// The line color for a logo whose color is already known, or whose artwork is already decoded
  /// in the image cache; seeds the first frame instead of swapping from white once `derive` runs.
  static func cached(symbol: String, imageURL: String?) -> LivelineColor? {
    guard let key = key(symbol: symbol, imageURL: imageURL) else { return nil }
    if let known = cache[key] { return known }
    let image: UIImage? = TokenLogo.bundledImage(symbol: symbol)
      ?? TokenLogo.logoCandidates(symbol: symbol, imageURL: imageURL).lazy
        .compactMap { AggrImageCache.shared.cachedImage(for: $0) }.first
    guard let image else { return nil }
    return remember(TokenIconColor.color(from: image) ?? .white, for: key)
  }

  static func derive(symbol: String, imageURL: String?) async -> LivelineColor? {
    guard let key = key(symbol: symbol, imageURL: imageURL) else { return nil }
    if let known = cache[key] { return known }
    var image = TokenLogo.bundledImage(symbol: symbol)
    if image == nil {
      for url in TokenLogo.logoCandidates(symbol: symbol, imageURL: imageURL) {
        image = await AggrImageCache.shared.image(for: url)
        if image != nil || Task.isCancelled { break }
      }
    }
    guard let image, !Task.isCancelled else { return nil }
    // A colorless logo settles on white so the sampling never reruns for it.
    return remember(TokenIconColor.color(from: image) ?? .white, for: key)
  }

  private static func remember(_ color: LivelineColor, for key: String) -> LivelineColor {
    if cache.count >= 128 { cache.removeAll() }
    cache[key] = color
    return color
  }

  private static func key(symbol: String, imageURL: String?) -> String? {
    if LogoOverrides.bundledAssetName(symbol: symbol) != nil { return "asset:\(symbol.lowercased())" }
    return TokenLogo.logoCandidates(symbol: symbol, imageURL: imageURL).first?.absoluteString
  }
}
