import Foundation

/// Port of `packages/ui/src/lib/oklch.ts` — single source of truth for color math.
/// Colors are authored as `oklch(L C H)` / `oklch(L C H / A)` strings.
public struct Oklch: Sendable, Equatable, Hashable {
  public var l: Double
  public var c: Double
  public var h: Double
  public var alpha: Double

  public init(l: Double, c: Double, h: Double, alpha: Double = 1) {
    self.l = l; self.c = c; self.h = h; self.alpha = alpha
  }
}

public enum OklchColor {
  private static let pattern = try! NSRegularExpression(
    pattern: #"^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:/\s*([\d.]+%?))?\s*\)$"#,
    options: [.caseInsensitive]
  )

  /// Parse an `oklch()` string. Returns nil for any other format.
  public static func parse(_ color: String) -> Oklch? {
    let trimmed = color.trimmingCharacters(in: .whitespacesAndNewlines)
    let ns = trimmed as NSString
    guard let m = pattern.firstMatch(in: trimmed, range: NSRange(location: 0, length: ns.length)) else { return nil }
    func group(_ i: Int) -> String? {
      let r = m.range(at: i)
      return r.location == NSNotFound ? nil : ns.substring(with: r)
    }
    func num(_ s: String, pctScale: Double) -> Double {
      if s.hasSuffix("%") { return (Double(s.dropLast()) ?? 0) / 100 * pctScale }
      return Double(s) ?? 0
    }
    guard let l = group(1), let c = group(2), let h = group(3) else { return nil }
    return Oklch(
      l: num(l, pctScale: 1),
      c: num(c, pctScale: 0.4),
      h: Double(h) ?? 0,
      alpha: group(4).map { num($0, pctScale: 1) } ?? 1
    )
  }

  /// OKLCH → sRGB (0–255 per channel), gamut-clamped.
  public static func toRgb(_ o: Oklch) -> (r: Int, g: Int, b: Int) {
    let hr = o.h * .pi / 180
    let a = o.c * cos(hr)
    let b = o.c * sin(hr)
    let l_ = o.l + 0.3963377774 * a + 0.2158037573 * b
    let m_ = o.l - 0.1055613458 * a - 0.0638541728 * b
    let s_ = o.l - 0.0894841775 * a - 1.291485548 * b
    let l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_
    let lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    let lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    let lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    func gamma(_ c: Double) -> Double {
      let x = min(1, max(0, c))
      return x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1 / 2.4) - 0.055
    }
    return (Int((gamma(lr) * 255).rounded()), Int((gamma(lg) * 255).rounded()), Int((gamma(lb) * 255).rounded()))
  }

  /// OKLCH → linear-free sRGB components in 0…1 (for SwiftUI `Color`).
  public static func toUnitRgb(_ o: Oklch) -> (r: Double, g: Double, b: Double) {
    let (r, g, b) = toRgb(o)
    return (Double(r) / 255, Double(g) / 255, Double(b) / 255)
  }

  /// sRGB (0–255, fractional ok) → OKLCH. Achromatic colors get H pinned to 0.
  public static func fromSrgb(_ r8: Double, _ g8: Double, _ b8: Double) -> (l: Double, c: Double, h: Double) {
    func lin(_ c8: Double) -> Double {
      let c = c8 / 255
      return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    let r = lin(r8), g = lin(g8), b = lin(b8)
    let l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    let m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    let s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    let L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    let A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    let B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    let C = hypot(A, B)
    var H = atan2(B, A) * 180 / .pi
    if H < 0 { H += 360 }
    if C < 1e-4 { H = 0 }
    return (L, C, H)
  }

  /// JS `Number.parseFloat(n.toFixed(dp))` rendered the way JS prints numbers.
  static func trim(_ n: Double, _ dp: Int) -> String {
    let rounded = (n * pow(10, Double(dp))).rounded() / pow(10, Double(dp))
    return jsNumberString(rounded)
  }

  /// Renders a Double like JavaScript's default `Number#toString` for the common range.
  public static func jsNumberString(_ v: Double) -> String {
    if v == v.rounded() && Swift.abs(v) < 1e15 { return String(Int(v)) }
    var s = String(format: "%.10f", v)
    while s.hasSuffix("0") { s.removeLast() }
    if s.hasSuffix(".") { s.removeLast() }
    return s
  }

  /// Format as CSS string (L/C `precision` dp, H `max(2, precision-2)` dp; alpha 4dp when < 1).
  public static func format(l: Double, c: Double, h: Double, alpha: Double = 1, precision: Int = 4) -> String {
    let body = "\(trim(l, precision)) \(trim(c, precision)) \(trim(h, max(2, precision - 2)))"
    return alpha >= 1 ? "oklch(\(body))" : "oklch(\(body) / \(trim(alpha, 4)))"
  }

  /// sRGB → `oklch()` string that round-trips exactly to the same 8-bit triplet.
  public static func srgbToString(_ r: Double, _ g: Double, _ b: Double, alpha: Double = 1) -> String {
    let (l, c, h) = fromSrgb(r, g, b)
    let target = (Int(r.rounded()), Int(g.rounded()), Int(b.rounded()))
    for precision in 4...7 {
      let out = format(l: l, c: c, h: h, alpha: alpha, precision: precision)
      guard let parsed = parse(out) else { break }
      let rgb = toRgb(parsed)
      if rgb.r == target.0 && rgb.g == target.1 && rgb.b == target.2 { return out }
    }
    return alpha >= 1 ? "oklch(\(l) \(c) \(h))" : "oklch(\(l) \(c) \(h) / \(alpha))"
  }

  /// Bridge for libs that only parse rgb.
  public static func toRgbString(_ color: String) -> String {
    guard let o = parse(color) else { return color }
    let (r, g, b) = toRgb(o)
    return o.alpha < 1 ? "rgba(\(r), \(g), \(b), \(jsNumberString(o.alpha)))" : "rgb(\(r), \(g), \(b))"
  }

  private static let alphaPattern = try! NSRegularExpression(
    pattern: #"^oklch\(\s*([^/)]+?)\s*(?:/\s*[\d.]+%?)?\s*\)$"#, options: [.caseInsensitive])

  /// Set/replace alpha — pure string surgery.
  public static func withAlpha(_ color: String, _ alpha: Double) -> String {
    let trimmed = color.trimmingCharacters(in: .whitespacesAndNewlines)
    let ns = trimmed as NSString
    guard let m = alphaPattern.firstMatch(in: trimmed, range: NSRange(location: 0, length: ns.length)) else { return color }
    return "oklch(\(ns.substring(with: m.range(at: 1))) / \(jsNumberString(alpha)))"
  }

  /// Multiply existing alpha by `factor`.
  public static func multiplyAlpha(_ color: String, _ factor: Double) -> String {
    guard let o = parse(color) else { return color }
    let a = max(0, min(1, o.alpha * factor))
    return "oklch(\(jsNumberString(o.l)) \(jsNumberString(o.c)) \(jsNumberString(o.h)) / \(jsNumberString(a)))"
  }

  /// Interpolate between two oklch strings along the shorter hue arc.
  public static func mix(_ a: String, _ b: String, _ t: Double) -> String {
    guard let ca = parse(a), let cb = parse(b) else { return a }
    var dh = cb.h - ca.h
    if dh > 180 { dh -= 360 } else if dh < -180 { dh += 360 }
    let h = (ca.h + dh * t + 360).truncatingRemainder(dividingBy: 360)
    return format(l: ca.l + (cb.l - ca.l) * t, c: ca.c + (cb.c - ca.c) * t, h: h, alpha: ca.alpha + (cb.alpha - ca.alpha) * t)
  }

  /// Adjust lightness/chroma (absolute deltas, clamped).
  public static func adjust(_ color: String, dl: Double = 0, dc: Double = 0, alpha: Double? = nil) -> String {
    guard let o = parse(color) else { return color }
    let l = max(0, min(1, o.l + dl))
    let c = max(0, o.c + dc)
    let a = alpha ?? o.alpha
    return a >= 1
      ? "oklch(\(trim(l, 4)) \(trim(c, 4)) \(jsNumberString(o.h)))"
      : "oklch(\(trim(l, 4)) \(trim(c, 4)) \(jsNumberString(o.h)) / \(jsNumberString(a)))"
  }
}
