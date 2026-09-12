import Foundation

/// Port of `apps/app/src/lib/chart-colors.ts`.
public enum ChartColors {
  public static let candleUp = "oklch(0.7227 0.192 149.58)"   // green-500
  public static let candleDown = "oklch(0.6368 0.2078 25.33)"  // red-500

  public static let pastel: [String] = [
    "oklch(0.7945 0.046 249.44)",  // Soft blue
    "oklch(0.8008 0.0617 357.54)", // Soft pink
    "oklch(0.8295 0.0677 171.92)", // Soft green
    "oklch(0.8778 0.0628 91.15)",  // Soft yellow
    "oklch(0.7722 0.0802 314.32)", // Soft purple
    "oklch(0.8028 0.0572 40.48)",  // Soft coral
    "oklch(0.8146 0.0578 211.58)", // Soft cyan
    "oklch(0.8144 0.0952 144.64)", // Soft lime
    "oklch(0.8111 0.0828 326.31)", // Soft magenta
    "oklch(0.8335 0.0553 75.1)",   // Soft orange
    "oklch(0.8135 0.0436 229.59)", // Soft sky blue
    "oklch(0.8566 0.0719 126.06)", // Soft sage
  ]

  public static func generatePastelColors(_ count: Int) -> [String] {
    if count <= pastel.count { return Array(pastel.prefix(max(0, count))) }
    var colors = pastel
    let hueStep = 360.0 / Double(count)
    for i in pastel.count..<count {
      let hue = ((Double(i) * hueStep).truncatingRemainder(dividingBy: 360) * 100).rounded() / 100
      let chroma = 0.055 + Double(i % 3) * 0.008
      let lightness = 0.8 + Double(i % 2) * 0.03
      colors.append("oklch(\(OklchColor.jsNumberString(lightness)) \(OklchColor.jsNumberString(chroma)) \(OklchColor.jsNumberString(hue)))")
    }
    return colors
  }

  public static func addOpacity(_ color: String, _ opacity: Double) -> String {
    OklchColor.withAlpha(color, opacity)
  }
}
