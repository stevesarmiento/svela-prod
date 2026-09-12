import Foundation

/// Decimal quantities use the same locale for editing and parsing. Never guess whether a comma
/// means a decimal or a thousands separator, and never accept only a prefix of the input.
public enum HoldingsAmount {
  public enum ParseError: Error { case invalid }

  public static func format(_ value: Double, locale: Locale = .current) -> String {
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.usesGroupingSeparator = false
    formatter.usesSignificantDigits = true
    formatter.maximumSignificantDigits = 17
    return formatter.string(from: NSNumber(value: value)) ?? ""
  }

  public static func parse(_ text: String, locale: Locale = .current) throws -> Double? {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return nil }
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    let decimal = formatter.decimalSeparator ?? "."
    let grouping = formatter.groupingSeparator ?? ","
    let parts = text.components(separatedBy: decimal)
    guard parts.count <= 2 else { throw ParseError.invalid }
    var integer = parts[0]
    if grouping.unicodeScalars.allSatisfy({ CharacterSet.whitespaces.contains($0) }) {
      for separator in [" ", "\u{00A0}", "\u{202F}"] {
        integer = integer.replacingOccurrences(of: separator, with: grouping)
      }
    }
    let groups = integer.components(separatedBy: grouping)
    if groups.count > 1 {
      let primary = max(1, formatter.groupingSize)
      let secondary = formatter.secondaryGroupingSize > 0 ? formatter.secondaryGroupingSize : primary
      guard let first = groups.first, (1...secondary).contains(first.count), groups.last?.count == primary,
            groups.dropFirst().dropLast().allSatisfy({ $0.count == secondary }) else { throw ParseError.invalid }
    }
    func digits(_ raw: String) throws -> String {
      try raw.map { char in
        guard char.unicodeScalars.allSatisfy({ CharacterSet.decimalDigits.contains($0) }),
              let digit = char.wholeNumberValue, (0...9).contains(digit) else { throw ParseError.invalid }
        return String(digit)
      }.joined()
    }
    let whole = try digits(groups.joined())
    let fraction = try parts.count == 2 ? digits(parts[1]) : ""
    guard !whole.isEmpty || !fraction.isEmpty,
          let value = Double((whole.isEmpty ? "0" : whole) + "." + fraction), value.isFinite, value >= 0 else { throw ParseError.invalid }
    return value
  }
}
