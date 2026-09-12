import AggrCore
import SwiftUI

/// Price text with the web precision ladder and monospaced digits. `nil` → "—" (null ≠ 0).
struct UsdText: View {
  let value: Double?
  var font: Font = .body

  var body: some View {
    Text(value.map { UsdFormat.price($0) } ?? "—")
      .font(font)
      .monospacedDigit()
  }
}

/// Animated numeric text (replaces number-flow). Formatter is applied to the current value.
struct AnimatedNumber: View {
  let value: Double
  var format: (Double) -> String = { UsdFormat.price($0) }
  var font: Font = .title

  var body: some View {
    Text(format(value))
      .font(font)
      .monospacedDigit()
      .contentTransition(.numericText(value: value))
      .animation(.snappy(duration: 0.4), value: value)
  }
}

/// Signed USD move + percent badge pair ("+$12.30  ▲ 1.23%").
struct MoveWithBadge: View {
  let usdMove: Double?
  let pct: Double?

  var body: some View {
    HStack(spacing: 6) {
      Text(usdMove.map { UsdFormat.signedPrice($0) } ?? "—")
        .font(.footnote.monospacedDigit())
        .foregroundStyle((usdMove ?? 0) >= 0 ? Color.gainGreen : Color.lossRed)
      PercentBadge(pct: pct, compact: true)
    }
  }
}
