import AggrCore
import SwiftUI

extension Color {
  /// Build a SwiftUI color from an `oklch()` string (web palette source of truth). Falls back to gray.
  init(oklch string: String) {
    guard let o = OklchColor.parse(string) else { self = .gray; return }
    let (r, g, b) = OklchColor.toUnitRgb(o)
    self = Color(.sRGB, red: r, green: g, blue: b, opacity: o.alpha)
  }

  static let gainGreen = Color(oklch: ChartColors.candleUp)
  static let lossRed = Color(oklch: ChartColors.candleDown)
}
