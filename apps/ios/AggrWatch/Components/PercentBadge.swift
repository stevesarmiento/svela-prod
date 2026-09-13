import AggrCore
import SwiftUI

/// Mirrors the web percent badge: ▲/▼ glyph + `abs.toFixed(2)%`, green/red/neutral tint; "N/A" for non-finite.
struct PercentBadge: View {
  let pct: Double?
  var compact = false

  var body: some View {
    let value = pct.map(UsdFormat.clampPercent)
    HStack(spacing: 2) {
      if let value, value.isFinite {
        if value != 0 {
          Image(systemName: "triangle.fill")
            .font(.system(size: compact ? 6 : 7))
            .rotationEffect(.degrees(value < 0 ? 180 : 0))
        }
        Text(String(format: "%.2f%%", abs(value)))
      } else {
        Text("N/A")
      }
    }
    .font(.system(size: compact ? 11 : 12, weight: .semibold, design: .monospaced))
    .foregroundStyle(tint(value))
    .padding(.horizontal, compact ? 5 : 7)
    .padding(.vertical, compact ? 2 : 3)
    .background(tint(value).opacity(0.12), in: Capsule())
  }

  private func tint(_ value: Double?) -> Color {
    guard let value, value.isFinite else { return .secondary }
    if value > 0 { return .gainGreen }
    if value < 0 { return .lossRed }
    return .secondary
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
