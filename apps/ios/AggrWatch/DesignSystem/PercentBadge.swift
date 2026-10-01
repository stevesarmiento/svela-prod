import AggrCore
import SwiftUI
import Torph

/// Mirrors the web percent badge: ▲/▼ glyph + `abs.toFixed(2)%`, green/red/neutral tint; "N/A" for non-finite.
struct PercentBadge: View {
  let pct: Double?
  var compact = false
  var textSize: CGFloat? = nil

  static func label(for pct: Double?) -> String {
    guard let pct, pct.isFinite else { return "N/A" }
    return String(format: "%.2f%%", abs(UsdFormat.clampPercent(pct)))
  }

  var body: some View {
    let value = pct.map(UsdFormat.clampPercent)
    HStack(spacing: 2) {
      if let value, value.isFinite, value != 0 {
        Image(systemName: "triangle.fill")
          .font(.system(size: compact ? 6 : 7))
          .rotationEffect(.degrees(value < 0 ? 180 : 0))
      }
      TorphText(Self.label(for: pct))
        .lineLimit(1)
    }
    .fixedSize()
    .font(.number(size: textSize ?? (compact ? 11 : 12), weight: .semibold))
    .foregroundStyle(Color.change(value))
    .padding(.horizontal, compact ? 5 : 7)
    .padding(.vertical, compact ? 2 : 3)
    .background(Color.change(value).opacity(0.12), in: Capsule())
  }
}

#if DEBUG
#Preview("Gain, loss, zero and missing") {
  VStack(spacing: 16) {
    HStack { PercentBadge(pct: 12.34); PercentBadge(pct: -4.56); PercentBadge(pct: 0); PercentBadge(pct: nil) }
    HStack { PercentBadge(pct: 12.34, compact: true); PercentBadge(pct: -4.56, compact: true) }
  }.padding().preferredColorScheme(.dark)
}
#endif
