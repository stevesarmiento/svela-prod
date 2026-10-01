import AggrCore
import SwiftUI

/// Price text with the web precision ladder and monospaced digits. `nil` → "—" (null ≠ 0).
struct UsdText: View {
  let value: Double?
  var font: Font = .body

  var body: some View {
    Text(UsdFormat.price(value))
      .font(font)
      .monospacedDigit()
  }
}

/// Headline price styling shared by the token page and the overview total: the currency sign and
/// the fraction sit in the secondary colour so the whole dollars carry the weight.
enum StyledUsd {
  static func price(_ value: Double?) -> AttributedString {
    guard let value, value.isFinite else { return AttributedString("—") }
    return styled(UsdFormat.price(value))
  }

  static func styled(_ formatted: String) -> AttributedString {
    var result = AttributedString(formatted)
    if let currency = result.range(of: "$") { result[currency].foregroundColor = .secondary }
    if let decimal = formatted.firstIndex(of: "."), let fraction = result.range(of: String(formatted[decimal...])) {
      result[fraction].foregroundColor = .secondary
    }
    return result
  }
}

/// Numeric text that rolls between values.
struct AnimatedNumber: View {
  let value: Double?
  var format: (Double) -> String = { UsdFormat.price($0) }
  var font: Font = .title
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Text(value.map(format) ?? "—")
      .font(font)
      .monospacedDigit()
      .contentTransition(.numericText(value: value ?? 0))
      .animation(Motion.animation(Motion.numeric, reduceMotion: reduceMotion), value: value)
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
        .foregroundStyle(Color.change(usdMove))
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
      Text(StyledUsd.price(price.wrappedValue)).font(.number(size: 30))
      MoveWithBadge(usdMove: 184.50, pct: 2.84)
      MoveWithBadge(usdMove: -32.14, pct: -1.32)
    }.padding().preferredColorScheme(.dark)
  }
}
#endif
