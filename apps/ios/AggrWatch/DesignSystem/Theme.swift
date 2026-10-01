import AggrCore
import SwiftUI

/// Design tokens. Dark-only by decision; the neutral ramp matches the wallet app so shared
/// components look identical in both. Gain/loss come from AggrCore's web palette, the tested
/// single source for chart colours.
nonisolated enum Theme {
  // Neutral ramp
  static let background = Color(white: 0.02)
  static let surface = Color(white: 0.05)
  static let elevated = Color(white: 0.08)
  static let border = Color(white: 0.16)
  static let text = Color(white: 0.96)
  static let secondaryText = Color(white: 0.64)
  static let mutedText = Color(white: 0.40)

  /// Warm sand accent (`AccentColor` in the asset catalog).
  static let accent = Color("AccentColor")

  /// Tailwind green-500 / red-500, parsed once from the web palette strings.
  static let gainGreen = Color(oklch: ChartColors.candleUp)
  static let lossRed = Color(oklch: ChartColors.candleDown)
  static let destructive = lossRed

  enum Radius {
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let card: CGFloat = 20
    static let lg: CGFloat = 24
    static let pill: CGFloat = 30
    static let circle: CGFloat = 44
  }

  enum Spacing {
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 14
    static let base: CGFloat = 16
    static let lg: CGFloat = 20
  }

  static let hitTarget: CGFloat = 44
}

nonisolated extension Color {
  /// Build a SwiftUI color from an `oklch()` string (web palette source of truth).
  /// Unparseable strings fall back to the elevated neutral instead of a visible gray.
  init(oklch string: String) {
    guard let o = OklchColor.parse(string) else { self = Theme.elevated; return }
    let (r, g, b) = OklchColor.toUnitRgb(o)
    self = Color(.sRGB, red: r, green: g, blue: b, opacity: o.alpha)
  }

  static let gainGreen = Theme.gainGreen
  static let lossRed = Theme.lossRed

  /// Tint for a signed change: gain, loss, or secondary for zero / missing.
  static func change(_ value: Double?) -> Color {
    guard let value, value.isFinite, value != 0 else { return .secondary }
    return value > 0 ? .gainGreen : .lossRed
  }
}
