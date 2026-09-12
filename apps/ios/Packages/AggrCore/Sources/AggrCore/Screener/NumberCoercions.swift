import Foundation

/// Port of `lib/smart-screener/number-coercions.ts`.
public enum NumberCoercions {
  /// "$1.2b", "200m", "10k", "5bn", "1t" → Double. nil when not parseable.
  public static func parseCompactUsdAmount(_ raw: String) -> Double? {
    let cleaned = raw.trimmingCharacters(in: .whitespaces).lowercased()
      .replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "_", with: "")
    guard !cleaned.isEmpty else { return nil }
    let pattern = try! NSRegularExpression(pattern: #"^([0-9]*\.?[0-9]+)\s*(k|m|b|t|bn)?$"#)
    let ns = cleaned as NSString
    guard let m = pattern.firstMatch(in: cleaned, range: NSRange(location: 0, length: ns.length)) else { return nil }
    guard let n = Double(ns.substring(with: m.range(at: 1))), n.isFinite else { return nil }
    let suffix = m.range(at: 2).location == NSNotFound ? "" : ns.substring(with: m.range(at: 2))
    let mult: Double = switch suffix { case "k": 1e3; case "m": 1e6; case "b", "bn": 1e9; case "t": 1e12; default: 1 }
    let v = n * mult
    return v.isFinite ? v : nil
  }

  /// "55%" or "55" → 55 (percent points). nil when not numeric.
  public static func parsePercentPoints(_ raw: String) -> Double? {
    var cleaned = raw.trimmingCharacters(in: .whitespaces)
    if cleaned.hasSuffix("%") { cleaned.removeLast() }
    guard let v = Double(cleaned.trimmingCharacters(in: .whitespaces)), v.isFinite else { return nil }
    return v
  }

  public static func parseInteger(_ raw: String) -> Int? {
    guard let v = Double(raw.trimmingCharacters(in: .whitespaces)), v.isFinite, v == v.rounded() else { return nil }
    return Int(v)
  }

  /// `coerceNumber`: USD parsing for `^[\d$]`, percent for trailing `%`, else plain parseFloat (commas stripped).
  public static func coerce(_ raw: String) -> Double? {
    let t = raw.trimmingCharacters(in: .whitespaces)
    guard !t.isEmpty else { return nil }
    if let first = t.first, first.isNumber || first == "$", let usd = parseCompactUsdAmount(t), usd >= 0 { return usd }
    if t.range(of: #"%\s*$"#, options: .regularExpression) != nil, let pct = parsePercentPoints(t) { return pct }
    let stripped = t.replacingOccurrences(of: ",", with: "")
    // parseFloat semantics: leading numeric prefix
    let scanner = Scanner(string: stripped)
    if let v = scanner.scanDouble(), v.isFinite { return v }
    return nil
  }
}
