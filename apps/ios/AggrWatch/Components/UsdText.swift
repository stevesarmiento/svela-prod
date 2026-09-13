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
  let value: Double?
  var format: (Double) -> String = { UsdFormat.price($0) }
  var font: Font = .title

  var body: some View {
    Text(value.map(format) ?? "—")
      .font(font)
      .monospacedDigit()
      .contentTransition(.numericText(value: value ?? 0))
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

#if DEBUG
#Preview("Currency and numeric changes") {
  PreviewValue(67_420.0) { price in
    VStack(spacing: 16) {
      AnimatedNumber(value: price.wrappedValue)
      Button("Change price") { price.wrappedValue += 125.50 }
      HStack { UsdText(value: 0.0000123); UsdText(value: 3_480); UsdText(value: nil) }
      MoveWithBadge(usdMove: 184.50, pct: 2.84)
      MoveWithBadge(usdMove: -32.14, pct: -1.32)
    }.padding().preferredColorScheme(.dark)
  }
}
#endif
